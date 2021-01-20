const { expect } = require('chai')
const getTimestamp = require('../util/getTimestamp')
const createMockOption = require('../util/createMockOption')
const getPriceProviderMock = require('../util/getPriceProviderMock')
const createConfigurationManager = require('../util/createConfigurationManager')
const addLiquidity = require('../util/addLiquidity')

const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD'

describe('OptionExchange', () => {
  let OptionExchange, OptionAMMFactory
  let exchange, configurationManager
  let stableAsset, strikeAsset
  let option, pool, optionAMMFactory
  let deployer, deployerAddress
  let caller, callerAddress

  before(async () => {
    ;[deployer, caller] = await ethers.getSigners()
    ;[deployerAddress, callerAddress] = await Promise.all([
      deployer.getAddress(),
      caller.getAddress()
    ])

    ;[OptionExchange, OptionAMMFactory] = await Promise.all([
      ethers.getContractFactory('OptionExchange'),
      ethers.getContractFactory('OptionAMMFactory'),
    ])
  })

  beforeEach(async () => {
    option = await createMockOption()

    const mock = await getPriceProviderMock(caller, '8200000000', 6, await option.underlyingAsset())
    const priceProviderMock = mock.priceProvider
    configurationManager = await createConfigurationManager(priceProviderMock)

    ;[strikeAsset, stableAsset, optionAMMFactory] = await Promise.all([
      ethers.getContractAt('MintableERC20', await option.strikeAsset()),
      ethers.getContractAt('MintableERC20', await option.strikeAsset()),
      OptionAMMFactory.deploy(configurationManager.address)
    ])

    pool = await createOptionAMMPool(option, optionAMMFactory, deployer)
    const optionsLiquidity = ethers.BigNumber.from(10e8)
    const stableLiquidity = ethers.BigNumber.from(1000e6)

    await addLiquidity(pool, optionsLiquidity, stableLiquidity, deployer)

    exchange = await OptionExchange.deploy(optionAMMFactory.address)

    // Approving Strike Asset(Collateral) transfer into the Exchange
    await stableAsset.connect(caller).approve(exchange.address, ethers.constants.MaxUint256)
  })

  afterEach(async () => {
    await option.connect(caller).transfer(BURN_ADDRESS, await option.balanceOf(callerAddress))
    await stableAsset.connect(caller).burn(await stableAsset.balanceOf(callerAddress))
    await strikeAsset.connect(caller).burn(await strikeAsset.balanceOf(callerAddress))
  })

  it('assigns the factory address correctly', async () => {
    expect(await exchange.factory()).to.equal(optionAMMFactory.address)
  })

  describe('Mint', () => {
    it('mints the exact amount of options', async () => {
      const amountToMint = ethers.BigNumber.from(1e8.toString())
      const collateralAmount = await option.strikeToTransfer(amountToMint)

      await stableAsset.connect(caller).mint(collateralAmount)
      expect(await stableAsset.balanceOf(callerAddress)).to.equal(collateralAmount)

      await exchange.connect(caller).mint(
        option.address,
        amountToMint
      )

      expect(await option.balanceOf(callerAddress)).to.equal(amountToMint)
    })
  })

  describe('Mint and Add Liquidity', () => {
    it('mints and add the options to the pool as liquidity', async () => {
      const amountToMint = ethers.BigNumber.from(1e7.toString())
      const collateralAmount = await option.strikeToTransfer(amountToMint)
      const stableToAdd = ethers.BigNumber.from(200e6.toString())

      await strikeAsset.connect(caller).mint(collateralAmount)
      await stableAsset.connect(caller).mint(stableToAdd)

      const tx = exchange.connect(caller).mintAndAddLiquidity(
        option.address,
        amountToMint,
        stableAsset.address,
        stableToAdd
      )

      await expect(tx)
        .to.emit(exchange, 'LiquidityAdded')
        .withArgs(callerAddress, option.address, amountToMint, stableAsset.address, stableToAdd)
    })

    it('fails to add liquidity when the pool do not exist', async () => {
      const amountToMint = ethers.BigNumber.from(1e7.toString())
      const collateralAmount = await option.strikeToTransfer(amountToMint)
      const stableToAdd = ethers.BigNumber.from(200e6.toString())

      await strikeAsset.connect(caller).mint(collateralAmount)
      await stableAsset.connect(caller).mint(stableToAdd)

      const tx = exchange.connect(caller).mintAndAddLiquidity(
        ethers.constants.AddressZero,
        amountToMint,
        stableAsset.address,
        stableToAdd
      )

      await expect(tx).to.be.revertedWith('OptionExchange: pool not found')
    })
  })

  describe('Mint and Sell', () => {
    it('mints and sells the exact amount of options', async () => {
      const amountToMint = ethers.BigNumber.from(1e7.toString())
      const collateralAmount = await option.strikeToTransfer(amountToMint)
      const deadline = await getTimestamp() + 60

      await strikeAsset.connect(caller).mint(collateralAmount)

      const { 1: sigma } = await pool.getOptionTradeDetailsExactAInput(amountToMint)

      const tx = await exchange.connect(caller).mintAndSellOptions(
        option.address,
        amountToMint,
        stableAsset.address,
        0,
        deadline,
        sigma
      )

      const premium = await stableAsset.balanceOf(callerAddress)

      await expect(Promise.resolve(tx))
        .to.emit(exchange, 'OptionsSold')
        .withArgs(callerAddress, option.address, amountToMint, stableAsset.address, premium)
    })

    it('fails when the deadline has passed', async () => {
      const minOutputAmount = ethers.BigNumber.from(100e6.toString())
      const amountToMint = ethers.BigNumber.from(1e7.toString())
      const collateralAmount = await option.strikeToTransfer(amountToMint)
      const deadline = await getTimestamp()

      await strikeAsset.connect(caller).mint(collateralAmount)

      const { 1: sigma } = await pool.getOptionTradeDetailsExactAInput(amountToMint)

      const tx = exchange.connect(caller).mintAndSellOptions(
        option.address,
        amountToMint,
        stableAsset.address,
        minOutputAmount,
        deadline,
        sigma
      )

      await expect(tx).to.be.revertedWith('OptionExchange: deadline expired')
    })

    it('fails to sell when the pool do not exist', async () => {
      const minOutputAmount = ethers.BigNumber.from(100e6.toString())
      const amountToMint = ethers.BigNumber.from(1e7.toString())
      const collateralAmount = await option.strikeToTransfer(amountToMint)
      const deadline = await getTimestamp() + 60

      await stableAsset.connect(caller).mint(collateralAmount)

      const { 1: sigma } = await pool.getOptionTradeDetailsExactAInput(amountToMint)

      const tx = exchange.connect(caller).mintAndSellOptions(
        ethers.constants.AddressZero,
        amountToMint,
        stableAsset.address,
        minOutputAmount,
        deadline,
        sigma
      )

      await expect(tx).to.be.revertedWith('OptionExchange: pool not found')
    })
  })

  describe('Buy', () => {
    it('buys the exact amount of options', async () => {
      const minAcceptedCost = ethers.BigNumber.from(200e6.toString())
      const amountToBuy = ethers.BigNumber.from(1e7)
      const deadline = await getTimestamp() + 60

      const { 1: sigma } = await pool.getOptionTradeDetailsExactAOutput(amountToBuy)

      await stableAsset.connect(caller).mint(minAcceptedCost)

      const tx = await exchange.connect(caller).buyExactOptions(
        option.address,
        amountToBuy,
        stableAsset.address,
        minAcceptedCost,
        deadline,
        sigma
      )

      const spentAmount = minAcceptedCost.sub(await stableAsset.balanceOf(callerAddress))

      await expect(Promise.resolve(tx))
        .to.emit(exchange, 'OptionsBought')
        .withArgs(callerAddress, option.address, amountToBuy, stableAsset.address, spentAmount)
    })

    it('buy options with an exact amount of tokens', async () => {
      const inputAmount = ethers.BigNumber.from(200e6.toString())
      const minAcceptedOptions = ethers.BigNumber.from(1e7.toString())
      const deadline = await getTimestamp() + 60

      const { 1: sigma } = await pool.getOptionTradeDetailsExactBInput(inputAmount)

      await stableAsset.connect(caller).mint(inputAmount)

      const tx = await exchange.connect(caller).buyOptionsWithExactTokens(
        option.address,
        minAcceptedOptions,
        stableAsset.address,
        inputAmount,
        deadline,
        sigma
      )

      expect(await stableAsset.balanceOf(callerAddress)).to.equal(0)

      const boughtOptions = await option.balanceOf(callerAddress)

      await expect(Promise.resolve(tx))
        .to.emit(exchange, 'OptionsBought')
        .withArgs(callerAddress, option.address, boughtOptions, stableAsset.address, inputAmount)
    })

    it('fails to buy when the pool do not exist', async () => {
      const minAcceptedCost = ethers.BigNumber.from(200e6.toString())
      const amountToBuy = ethers.BigNumber.from(1e7)
      const deadline = await getTimestamp() + 60

      const { 1: sigma } = await pool.getOptionTradeDetailsExactAOutput(amountToBuy)

      await stableAsset.connect(caller).mint(minAcceptedCost)

      const tx = exchange.connect(caller).buyExactOptions(
        ethers.constants.AddressZero,
        amountToBuy,
        stableAsset.address,
        minAcceptedCost,
        deadline,
        sigma
      )

      await expect(tx).to.be.revertedWith('OptionExchange: pool not found')
    })

    it('fails when the deadline has passed', async () => {
      const minAcceptedCost = ethers.BigNumber.from(200e6.toString())
      const amountToBuy = ethers.BigNumber.from(1e7)
      const deadline = await getTimestamp()

      const { 1: sigma } = await pool.getOptionTradeDetailsExactAOutput(amountToBuy)

      await stableAsset.connect(caller).mint(minAcceptedCost)

      const tx = exchange.connect(caller).buyExactOptions(
        ethers.constants.AddressZero,
        amountToBuy,
        stableAsset.address,
        minAcceptedCost,
        deadline,
        sigma
      )

      await expect(tx).to.be.revertedWith('OptionExchange: deadline expired')
    })
  })
})

async function createOptionAMMPool (option, optionAMMFactory, caller) {
  const initialSigma = '960000000000000000'

  const [strikeAssetAddress, callerAddress] = await Promise.all([
    option.strikeAsset(),
    caller.getAddress()
  ])

  const tx = await optionAMMFactory.createPool(
    option.address,
    strikeAssetAddress,
    5000e6,
    initialSigma
  )

  const filterFrom = await optionAMMFactory.filters.PoolCreated(callerAddress)
  const eventDetails = await optionAMMFactory.queryFilter(filterFrom, tx.blockNumber, tx.blockNumber)

  const { pool: poolAddress } = eventDetails[0].args
  const pool = await ethers.getContractAt('OptionAMMPool', poolAddress)

  return pool
}
