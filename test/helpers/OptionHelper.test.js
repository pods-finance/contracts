const { expect } = require('chai')
const getTimestamp = require('../util/getTimestamp')
const createMockOption = require('../util/createMockOption')
const getPriceProviderMock = require('../util/getPriceProviderMock')
const createConfigurationManager = require('../util/createConfigurationManager')
const addLiquidity = require('../util/addLiquidity')
const { takeSnapshot, revertToSnapshot } = require('../util/snapshot')
const mintOptions = require('../util/mintOptions')

const OPTION_TYPE_PUT = 0
const OPTION_TYPE_CALL = 1

describe('OptionHelper', () => {
  let OptionHelper, OptionAMMFactory, MintableERC20
  let optionHelper, configurationManager
  let stableAsset, strikeAsset, underlyingAsset
  let option, pool, optionAMMFactory
  let deployer, deployerAddress
  let caller, callerAddress
  let snapshotId

  before(async () => {
    ;[deployer, caller] = await ethers.getSigners()
    ;[deployerAddress, callerAddress] = await Promise.all([
      deployer.getAddress(),
      caller.getAddress()
    ])

    ;[OptionHelper, OptionAMMFactory, MintableERC20] = await Promise.all([
      ethers.getContractFactory('OptionHelper'),
      ethers.getContractFactory('OptionAMMFactory'),
      ethers.getContractFactory('MintableERC20')
    ])

    underlyingAsset = await MintableERC20.deploy('WBTC', 'WBTC', 8)
  })

  beforeEach(async () => {
    configurationManager = await createConfigurationManager()
    const mock = await getPriceProviderMock({
      deployer: caller,
      price: '8200000000',
      decimals: 6,
      tokenAddress: underlyingAsset.address,
      configurationManager
    })
    await configurationManager.setPriceProvider(mock.priceProvider.address)

    option = await createMockOption({
      configurationManager,
      underlyingAsset: underlyingAsset.address
    })

    ;[strikeAsset, stableAsset, optionAMMFactory] = await Promise.all([
      ethers.getContractAt('MintableERC20', await option.strikeAsset()),
      ethers.getContractAt('MintableERC20', await option.strikeAsset()),
      OptionAMMFactory.deploy(configurationManager.address)
    ])

    await configurationManager.setAMMFactory(optionAMMFactory.address)

    pool = await createOptionAMMPool(option, optionAMMFactory, deployer)
    const optionsLiquidity = ethers.BigNumber.from(10e8)
    const stableLiquidity = ethers.BigNumber.from(100000e6)

    await addLiquidity(pool, optionsLiquidity, stableLiquidity, deployer)

    optionHelper = await OptionHelper.deploy(configurationManager.address)

    // Approving Strike Asset(Collateral) transfer into the Exchange
    await stableAsset.connect(caller).approve(optionHelper.address, ethers.constants.MaxUint256)
    await option.connect(caller).approve(optionHelper.address, ethers.constants.MaxUint256)

    snapshotId = await takeSnapshot()
  })

  afterEach(async () => {
    await revertToSnapshot(snapshotId)
  })

  it('cannot be deployed with a zero-address configuration manager', async () => {
    const tx = OptionHelper.deploy(ethers.constants.AddressZero)
    await expect(tx).to.be.revertedWith('OptionHelper: Configuration Manager is not a contract')
  })

  describe('Mint', () => {
    it('mints the exact amount of options', async () => {
      const amountToMint = ethers.BigNumber.from(1e8.toString())
      const collateralAmount = await option.strikeToTransfer(amountToMint)

      await stableAsset.connect(caller).mint(collateralAmount)
      expect(await stableAsset.balanceOf(callerAddress)).to.equal(collateralAmount)

      await optionHelper.connect(caller).mint(
        option.address,
        amountToMint
      )

      expect(await option.balanceOf(callerAddress)).to.equal(amountToMint)
    })

    it('mints both puts and call options', async () => {
      const amountToMint = ethers.BigNumber.from(1e8.toString())

      const putOption = await createMockOption({
        configurationManager,
        underlyingAsset: underlyingAsset.address,
        strikeAsset: stableAsset.address,
        optionType: OPTION_TYPE_PUT
      })

      const strikeToTransfer = await putOption.strikeToTransfer(amountToMint)
      await stableAsset.connect(caller).mint(strikeToTransfer)
      await stableAsset.connect(caller).approve(optionHelper.address, strikeToTransfer)

      await optionHelper.connect(caller).mint(
        putOption.address,
        amountToMint
      )

      expect(await putOption.balanceOf(callerAddress)).to.equal(amountToMint)

      const callOption = await createMockOption({
        configurationManager,
        underlyingAsset: underlyingAsset.address,
        strikeAsset: stableAsset.address,
        optionType: OPTION_TYPE_CALL
      })

      await underlyingAsset.connect(caller).mint(amountToMint)
      await underlyingAsset.connect(caller).approve(optionHelper.address, amountToMint)

      await optionHelper.connect(caller).mint(
        callOption.address,
        amountToMint
      )

      expect(await callOption.balanceOf(callerAddress)).to.equal(amountToMint)
    })
  })

  describe('Mint and Add Liquidity', () => {
    it('mints and add the options and stable tokens to the pool as liquidity', async () => {
      const amountToMint = ethers.BigNumber.from(1e7.toString())
      const collateralAmount = await option.strikeToTransfer(amountToMint)
      const stableToAdd = ethers.BigNumber.from(200e6.toString())

      await strikeAsset.connect(caller).mint(collateralAmount)
      await stableAsset.connect(caller).mint(stableToAdd)

      const tx = optionHelper.connect(caller).mintAndAddLiquidity(
        option.address,
        amountToMint,
        stableToAdd
      )

      await expect(tx)
        .to.emit(optionHelper, 'LiquidityAdded')
        .withArgs(callerAddress, option.address, amountToMint, stableAsset.address, stableToAdd)
    })

    it('mints and add the options to the pool as liquidity. Single-sided', async () => {
      const amountToMint = ethers.BigNumber.from(1e7.toString())
      const collateralAmount = await option.strikeToTransfer(amountToMint)
      const stableToAdd = ethers.BigNumber.from(0)

      await strikeAsset.connect(caller).mint(collateralAmount)

      const tx = optionHelper.connect(caller).mintAndAddLiquidity(
        option.address,
        amountToMint,
        stableToAdd
      )

      await expect(tx)
        .to.emit(optionHelper, 'LiquidityAdded')
        .withArgs(callerAddress, option.address, amountToMint, stableAsset.address, stableToAdd)
    })

    it('fails to add liquidity when the pool do not exist', async () => {
      const amountToMint = ethers.BigNumber.from(1e7.toString())
      const collateralAmount = await option.strikeToTransfer(amountToMint)
      const stableToAdd = ethers.BigNumber.from(200e6.toString())

      await strikeAsset.connect(caller).mint(collateralAmount)
      await stableAsset.connect(caller).mint(stableToAdd)

      const tx = optionHelper.connect(caller).mintAndAddLiquidity(
        ethers.constants.AddressZero,
        amountToMint,
        stableToAdd
      )

      await expect(tx).to.be.revertedWith('OptionHelper: pool not found')
    })
  })

  describe('Mint and Sell', () => {
    it('mints and sells the exact amount of options', async () => {
      const amountToMint = ethers.BigNumber.from(1e7.toString())
      const collateralAmount = await option.strikeToTransfer(amountToMint)
      const deadline = await getTimestamp() + 60

      await strikeAsset.connect(caller).mint(collateralAmount)

      const { 1: sigma } = await pool.getOptionTradeDetailsExactAInput(amountToMint)

      const tx = await optionHelper.connect(caller).mintAndSellOptions(
        option.address,
        amountToMint,
        0,
        deadline,
        sigma
      )

      const premium = await stableAsset.balanceOf(callerAddress)

      await expect(Promise.resolve(tx))
        .to.emit(optionHelper, 'OptionsMintedAndSold')
        .withArgs(callerAddress, option.address, amountToMint, stableAsset.address, premium)
    })

    it('fails when the deadline has passed', async () => {
      const minOutputAmount = ethers.BigNumber.from(100e6.toString())
      const amountToMint = ethers.BigNumber.from(1e7.toString())
      const collateralAmount = await option.strikeToTransfer(amountToMint)
      const deadline = await getTimestamp()

      await strikeAsset.connect(caller).mint(collateralAmount)

      const { 1: sigma } = await pool.getOptionTradeDetailsExactAInput(amountToMint)

      const tx = optionHelper.connect(caller).mintAndSellOptions(
        option.address,
        amountToMint,
        minOutputAmount,
        deadline,
        sigma
      )

      await expect(tx).to.be.revertedWith('OptionHelper: deadline expired')
    })

    it('fails to sell when the pool do not exist', async () => {
      const minOutputAmount = ethers.BigNumber.from(100e6.toString())
      const amountToMint = ethers.BigNumber.from(1e7.toString())
      const collateralAmount = await option.strikeToTransfer(amountToMint)
      const deadline = await getTimestamp() + 60

      await stableAsset.connect(caller).mint(collateralAmount)

      const { 1: sigma } = await pool.getOptionTradeDetailsExactAInput(amountToMint)

      const tx = optionHelper.connect(caller).mintAndSellOptions(
        ethers.constants.AddressZero,
        amountToMint,
        minOutputAmount,
        deadline,
        sigma
      )

      await expect(tx).to.be.revertedWith('OptionHelper: pool not found')
    })
  })

  describe('Add Liquidity', () => {
    it('add the options and stable tokens to the pool as liquidity', async () => {
      const amountToMint = ethers.BigNumber.from(1e7.toString())
      const stableToAdd = ethers.BigNumber.from(200e6.toString())

      // Minting options
      await mintOptions(option, amountToMint, caller)
      await option.connect(caller).approve(optionHelper.address, amountToMint)

      // Minting stable
      await stableAsset.connect(caller).mint(stableToAdd)

      const tx = optionHelper.connect(caller).addLiquidity(
        option.address,
        amountToMint,
        stableToAdd
      )

      await expect(tx)
        .to.emit(optionHelper, 'LiquidityAdded')
        .withArgs(callerAddress, option.address, amountToMint, stableAsset.address, stableToAdd)
    })

    it('add the options to the pool as liquidity. Single-sided', async () => {
      const amountToMint = ethers.BigNumber.from(1e7.toString())
      const stableToAdd = ethers.BigNumber.from(0)

      // Minting options
      await mintOptions(option, amountToMint, caller)
      await option.connect(caller).approve(optionHelper.address, amountToMint)

      // Minting stable
      await stableAsset.connect(caller).mint(stableToAdd)

      const tx = optionHelper.connect(caller).addLiquidity(
        option.address,
        amountToMint,
        stableToAdd
      )

      await expect(tx)
        .to.emit(optionHelper, 'LiquidityAdded')
        .withArgs(callerAddress, option.address, amountToMint, stableAsset.address, stableToAdd)
    })

    it('add stable tokens to the pool as liquidity. Single-sided', async () => {
      const amountToMint = ethers.BigNumber.from(0)
      const stableToAdd = ethers.BigNumber.from(200e6.toString())

      // Minting stable
      await stableAsset.connect(caller).mint(stableToAdd)

      const tx = optionHelper.connect(caller).addLiquidity(
        option.address,
        amountToMint,
        stableToAdd
      )

      await expect(tx)
        .to.emit(optionHelper, 'LiquidityAdded')
        .withArgs(callerAddress, option.address, amountToMint, stableAsset.address, stableToAdd)
    })

    it('fails to add liquidity when the pool do not exist', async () => {
      const amountToMint = ethers.BigNumber.from(1e7.toString())
      const collateralAmount = await option.strikeToTransfer(amountToMint)
      const stableToAdd = ethers.BigNumber.from(200e6.toString())

      // Minting options
      await mintOptions(option, amountToMint, caller)
      await option.connect(caller).approve(optionHelper.address, amountToMint)

      // Minting stable
      await strikeAsset.connect(caller).mint(collateralAmount)
      await stableAsset.connect(caller).mint(stableToAdd)

      const tx = optionHelper.connect(caller).addLiquidity(
        ethers.constants.AddressZero,
        amountToMint,
        stableToAdd
      )

      await expect(tx).to.be.revertedWith('OptionHelper: pool not found')
    })
  })

  describe('Buy', () => {
    it('buys the exact amount of options', async () => {
      const maxAcceptedCost = ethers.BigNumber.from(200e6.toString())
      const amountToBuy = ethers.BigNumber.from(1e7)
      const deadline = await getTimestamp() + 60

      const { 1: sigma } = await pool.getOptionTradeDetailsExactAOutput(amountToBuy)

      await stableAsset.connect(caller).mint(maxAcceptedCost)

      const tx = await optionHelper.connect(caller).buyExactOptions(
        option.address,
        amountToBuy,
        maxAcceptedCost,
        deadline,
        sigma
      )

      const balanceAfterTrade = await stableAsset.balanceOf(callerAddress)
      const spentAmount = maxAcceptedCost.sub(balanceAfterTrade)

      await expect(Promise.resolve(tx))
        .to.emit(optionHelper, 'OptionsBought')
        .withArgs(callerAddress, option.address, amountToBuy, stableAsset.address, spentAmount)
    })

    it('buy options with an exact amount of tokens', async () => {
      const inputAmount = ethers.BigNumber.from(200e6.toString())
      const minAcceptedOptions = ethers.BigNumber.from(1e7.toString())
      const deadline = await getTimestamp() + 60

      const { 1: sigma } = await pool.getOptionTradeDetailsExactBInput(inputAmount)

      await stableAsset.connect(caller).mint(inputAmount)

      const tx = await optionHelper.connect(caller).buyOptionsWithExactTokens(
        option.address,
        minAcceptedOptions,
        inputAmount,
        deadline,
        sigma
      )

      expect(await stableAsset.balanceOf(callerAddress)).to.equal(0)

      const boughtOptions = await option.balanceOf(callerAddress)

      await expect(Promise.resolve(tx))
        .to.emit(optionHelper, 'OptionsBought')
        .withArgs(callerAddress, option.address, boughtOptions, stableAsset.address, inputAmount)
    })

    it('fails to buy when the pool do not exist', async () => {
      const minAcceptedCost = ethers.BigNumber.from(200e6.toString())
      const amountToBuy = ethers.BigNumber.from(1e7)
      const deadline = await getTimestamp() + 60

      const { 1: sigma } = await pool.getOptionTradeDetailsExactAOutput(amountToBuy)

      await stableAsset.connect(caller).mint(minAcceptedCost)

      const tx = optionHelper.connect(caller).buyExactOptions(
        ethers.constants.AddressZero,
        amountToBuy,
        minAcceptedCost,
        deadline,
        sigma
      )

      await expect(tx).to.be.revertedWith('OptionHelper: pool not found')
    })

    it('fails when the deadline has passed', async () => {
      const minAcceptedCost = ethers.BigNumber.from(200e6.toString())
      const amountToBuy = ethers.BigNumber.from(1e7)
      const deadline = await getTimestamp()

      const { 1: sigma } = await pool.getOptionTradeDetailsExactAOutput(amountToBuy)

      await stableAsset.connect(caller).mint(minAcceptedCost)

      const tx = optionHelper.connect(caller).buyExactOptions(
        ethers.constants.AddressZero,
        amountToBuy,
        minAcceptedCost,
        deadline,
        sigma
      )

      await expect(tx).to.be.revertedWith('OptionHelper: deadline expired')
    })
  })

  describe('Sell', () => {
    it('sells the exact amount of options', async () => {
      const amountToSell = ethers.BigNumber.from(1e8.toString())
      const collateralAmount = await option.strikeToTransfer(amountToSell)
      const minAcceptedToReceive = ethers.BigNumber.from(200e6.toString())
      const deadline = await getTimestamp() + 6000

      await stableAsset.connect(caller).mint(collateralAmount)

      await optionHelper.connect(caller).mint(
        option.address,
        amountToSell
      )

      const { 1: sigma } = await pool.getOptionTradeDetailsExactAInput(amountToSell)

      const balanceBeforeTrade = await stableAsset.balanceOf(callerAddress)

      const tx = await optionHelper.connect(caller).sellExactOptions(
        option.address,
        amountToSell,
        minAcceptedToReceive,
        deadline,
        sigma
      )

      const balanceAfterTrade = await stableAsset.balanceOf(callerAddress)
      const amountReceived = balanceAfterTrade.sub(balanceBeforeTrade)

      await expect(Promise.resolve(tx))
        .to.emit(optionHelper, 'OptionsSold')
        .withArgs(callerAddress, option.address, amountToSell, stableAsset.address, amountReceived)
    })
    it('sells the estimated amount of options and receive exact tokens', async () => {
      const maxAcceptedOptionsToSell = ethers.BigNumber.from(10e8.toString())
      const collateralAmount = await option.strikeToTransfer(maxAcceptedOptionsToSell)
      const tokenBAmountToReceive = ethers.BigNumber.from('354849710')
      const deadline = await getTimestamp() + 6000

      await stableAsset.connect(caller).mint(collateralAmount)

      await optionHelper.connect(caller).mint(
        option.address,
        maxAcceptedOptionsToSell
      )

      const { 0: estimatedOptionsToSell, 1: sigma } = await pool.getOptionTradeDetailsExactBOutput(tokenBAmountToReceive)

      const balanceStableBeforeTrade = await stableAsset.balanceOf(callerAddress)

      const tx = await optionHelper.connect(caller).sellOptionsAndReceiveExactTokens(
        option.address,
        maxAcceptedOptionsToSell,
        tokenBAmountToReceive,
        deadline,
        sigma
      )

      const balanceStableAfterTrade = await stableAsset.balanceOf(callerAddress)

      const amountStableReceived = balanceStableAfterTrade.sub(balanceStableBeforeTrade)
      expect(amountStableReceived).to.be.equal(tokenBAmountToReceive)

      await expect(Promise.resolve(tx))
        .to.emit(optionHelper, 'OptionsSold')
        .withArgs(callerAddress, option.address, estimatedOptionsToSell, stableAsset.address, tokenBAmountToReceive)
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
    initialSigma
  )

  const filterFrom = await optionAMMFactory.filters.PoolCreated(callerAddress)
  const eventDetails = await optionAMMFactory.queryFilter(filterFrom, tx.blockNumber, tx.blockNumber)

  const { pool: poolAddress } = eventDetails[0].args
  const pool = await ethers.getContractAt('OptionAMMPool', poolAddress)

  return pool
}
