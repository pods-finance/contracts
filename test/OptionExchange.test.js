const { expect } = require('chai')
const getUniswapMock = require('./util/getUniswapMock')
const getTimestamp = require('./util/getTimestamp')

describe('OptionExchange', () => {
  let ContractFactory, MockERC20, OptionExchange, WETH, UniswapV1Provider
  let exchange, exchangeProvider, uniswapFactory, createExchange, clearMock
  let underlyingAsset, strikeAsset, weth
  let podPut
  let deployer, deployerAddress
  let caller, callerAddress

  before(async () => {
    ;[deployer, caller] = await ethers.getSigners()
    deployerAddress = await deployer.getAddress()
    callerAddress = await caller.getAddress()

    let uniswapMock

    ;[ContractFactory, MockERC20, OptionExchange, WETH, UniswapV1Provider, uniswapMock] = await Promise.all([
      ethers.getContractFactory('OptionFactory'),
      ethers.getContractFactory('MintableERC20'),
      ethers.getContractFactory('OptionExchange'),
      ethers.getContractFactory('WETH'),
      ethers.getContractFactory('UniswapV1Provider'),
      getUniswapMock(deployer)
    ])

    uniswapFactory = uniswapMock.uniswapFactory
    createExchange = uniswapMock.createExchange
    clearMock = uniswapMock.clearMock

    ;[underlyingAsset, strikeAsset, weth] = await Promise.all([
      MockERC20.deploy('WBTC', 'WBTC', 8),
      MockERC20.deploy('USDC', 'USDC', 6),
      WETH.deploy()
    ])
  })

  beforeEach(async () => {
    const factoryContract = await ContractFactory.deploy(weth.address)
    podPut = await makeOption(factoryContract, underlyingAsset, strikeAsset)

    exchangeProvider = await UniswapV1Provider.deploy()
    await exchangeProvider.initialize(uniswapFactory.address)

    exchange = await OptionExchange.deploy(exchangeProvider.address)

    // Approving Strike Asset(Collateral) transfer into the Exchange
    await strikeAsset.connect(caller).approve(exchange.address, ethers.constants.MaxUint256)

    // Clears Uniswap mock
    clearMock()
  })

  it('assigns the exchange address correctly', async () => {
    expect(await exchangeProvider.uniswapFactory()).to.equal(uniswapFactory.address)
  })

  describe('Sell', () => {
    it('sells the exact amount of options', async () => {
      const outputToken = strikeAsset.address
      const minOutputAmount = ethers.BigNumber.from(200e6.toString())
      const collateralAmount = await podPut.strikePrice()
      const amountToMint = ethers.BigNumber.from(1e8.toString())
      const deadline = await getTimestamp() + 60

      // Creates the Uniswap exchange
      await createExchange(podPut.address, minOutputAmount)

      await strikeAsset.connect(caller).mint(collateralAmount)
      expect(await strikeAsset.balanceOf(callerAddress)).to.equal(collateralAmount)

      const tx = exchange.connect(caller).sellOptions(
        podPut.address,
        amountToMint,
        outputToken,
        minOutputAmount,
        deadline
      )

      await expect(tx)
        .to.emit(exchange, 'OptionsSold')
        .withArgs(callerAddress, podPut.address, amountToMint, outputToken, minOutputAmount)
    })

    it('fails to sell when the exchange do not exist', async () => {
      const outputToken = strikeAsset.address
      const minOutputAmount = ethers.BigNumber.from(200e6.toString())
      const collateralAmount = await podPut.strikePrice()
      const amountToMint = ethers.BigNumber.from(1e8.toString())
      const deadline = await getTimestamp() + 60

      await strikeAsset.connect(caller).mint(collateralAmount)

      const tx = exchange.connect(caller).sellOptions(
        podPut.address,
        amountToMint,
        outputToken,
        minOutputAmount,
        deadline
      )

      await expect(tx).to.be.revertedWith('Exchange not found')

      // Burn unused tokens
      await strikeAsset.connect(caller).burn(collateralAmount)
    })

    it('fails when the deadline has passed', async () => {
      const outputToken = strikeAsset.address
      const minOutputAmount = ethers.BigNumber.from(200e6.toString())
      const collateralAmount = await podPut.strikePrice()
      const amountToMint = ethers.BigNumber.from(1e8.toString())
      const deadline = await getTimestamp() //

      // Creates the Uniswap exchange
      await createExchange(podPut.address, minOutputAmount)

      await strikeAsset.connect(caller).mint(collateralAmount)
      expect(await strikeAsset.balanceOf(callerAddress)).to.equal(collateralAmount)

      const tx = exchange.connect(caller).sellOptions(
        podPut.address,
        amountToMint,
        outputToken,
        minOutputAmount,
        deadline
      )

      await expect(tx).to.be.revertedWith('Transaction timeout')
    })
  })

  describe('Buy', () => {
    it('buys the exact amount of options', async () => {
      const inputToken = strikeAsset.address
      const minAcceptedCost = ethers.BigNumber.from(200e6.toString())
      const amountToBuy = ethers.BigNumber.from(1e8.toString())
      const deadline = await getTimestamp() + 60

      // Creates the Uniswap exchange
      await createExchange(inputToken, minAcceptedCost)

      const tx = exchange.connect(caller).buyExactOptions(
        podPut.address,
        amountToBuy,
        inputToken,
        minAcceptedCost,
        deadline
      )

      await expect(tx)
        .to.emit(exchange, 'OptionsBought')
        .withArgs(callerAddress, podPut.address, amountToBuy, inputToken, minAcceptedCost)
    })

    it('buys options with a exact amount of tokens', async () => {
      const inputToken = strikeAsset.address
      const inputAmount = ethers.BigNumber.from(200e6.toString())
      const minAcceptedOptions = ethers.BigNumber.from(1e8.toString())
      const deadline = await getTimestamp() + 60

      // Creates the Uniswap exchange
      await createExchange(inputToken, minAcceptedOptions)

      const tx = exchange.connect(caller).buyOptionsWithExactTokens(
        podPut.address,
        minAcceptedOptions,
        inputToken,
        inputAmount,
        deadline
      )

      await expect(tx)
        .to.emit(exchange, 'OptionsBought')
        .withArgs(callerAddress, podPut.address, minAcceptedOptions, inputToken, inputAmount)
    })

    it('fails to buy when the exchange do not exist', async () => {
      const inputToken = strikeAsset.address
      const cost = ethers.BigNumber.from(200e6.toString())
      const amountToBuy = ethers.BigNumber.from(1e8.toString())
      const deadline = await getTimestamp() + 60

      const tx = exchange.connect(caller).buyExactOptions(
        podPut.address,
        amountToBuy,
        inputToken,
        cost,
        deadline
      )

      await expect(tx).to.be.revertedWith('Exchange not found')
    })

    it('fails when the deadline has passed', async () => {
      const inputToken = strikeAsset.address
      const cost = ethers.BigNumber.from(200e6.toString())
      const amountToBuy = ethers.BigNumber.from(1e8.toString())
      const deadline = await getTimestamp()

      // Creates the Uniswap exchange
      await createExchange(podPut.address, cost)

      const tx = exchange.connect(caller).buyExactOptions(
        podPut.address,
        amountToBuy,
        inputToken,
        cost,
        deadline
      )

      await expect(tx).to.be.revertedWith('Transaction timeout')
    })
  })
})

async function makeOption (factoryContract, underlyingAsset, strikeAsset) {
  const OptionTypePut = 0
  const strikePrice = ethers.BigNumber.from(8000e6.toString())

  const txIdNewOption = await factoryContract.createOption(
    'pod:WBTC:USDC:8000:A',
    'pod:WBTC:USDC:8000:A',
    OptionTypePut,
    underlyingAsset.address,
    strikeAsset.address,
    strikePrice,
    await getTimestamp() + 5 * 60 * 60 * 1000
  )

  const [deployer] = await ethers.getSigners()
  const filterFrom = await factoryContract.filters.OptionCreated(await deployer.getAddress())
  const eventDetails = await factoryContract.queryFilter(filterFrom, txIdNewOption.blockNumber, txIdNewOption.blockNumber)

  const { option } = eventDetails[0].args
  return await ethers.getContractAt('PodPut', option)
}
