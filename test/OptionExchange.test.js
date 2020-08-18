const { expect } = require('chai')
const getUniswapMock = require('./util/getUniswapMock')

describe('OptionExchange', () => {
  let ContractFactory, MockERC20, ExchangeContract, WETH
  let exchange, uniswapFactory, createExchange
  let underlyingAsset, strikeAsset, weth
  let podPut
  let deployer, deployerAddress
  let seller, sellerAddress
  let buyer, buyerAddress

  before(async () => {
    ;[deployer, seller, buyer, delegator] = await ethers.getSigners()
    deployerAddress = await deployer.getAddress()
    sellerAddress = await seller.getAddress()
    buyerAddress = await buyer.getAddress()

    let uniswapMock

    ;[ContractFactory, MockERC20, ExchangeContract, WETH, uniswapMock] = await Promise.all([
      ethers.getContractFactory('OptionFactory'),
      ethers.getContractFactory('MintableERC20'),
      ethers.getContractFactory('OptionExchange'),
      ethers.getContractFactory('WETH'),
      getUniswapMock(deployer)
    ])

    uniswapFactory = uniswapMock.uniswapFactory
    createExchange = uniswapMock.createExchange

    ;[underlyingAsset, strikeAsset, weth] = await Promise.all([
      MockERC20.deploy('WBTC', 'WBTC', 8),
      MockERC20.deploy('USDC', 'USDC', 6),
      WETH.deploy()
    ])
  })

  beforeEach(async () => {
    const factoryContract = await ContractFactory.deploy(weth.address)
    podPut = await makeOption(factoryContract, underlyingAsset, strikeAsset)
    exchange = await ExchangeContract.deploy(uniswapFactory.address)

    // Approving Strike Asset(Collateral) transfer into the Exchange
    await strikeAsset.connect(seller).approve(exchange.address, ethers.constants.MaxUint256)
  })

  it('assigns the exchange address correctly', async () => {
    expect(await exchange.uniswapFactory()).to.equal(uniswapFactory.address)
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

      await strikeAsset.connect(seller).mint(collateralAmount)
      expect(await strikeAsset.balanceOf(sellerAddress)).to.equal(collateralAmount)

      const tx = exchange.connect(seller).sellOptions(
        podPut.address,
        amountToMint,
        outputToken,
        minOutputAmount,
        deadline
      )

      await expect(tx)
        .to.emit(exchange, 'OptionsSold')
        .withArgs(sellerAddress, podPut.address, amountToMint, outputToken, minOutputAmount)
    })

    it('fails to sell when the exchange do not exist', async () => {
      const outputToken = strikeAsset.address
      const minOutputAmount = ethers.BigNumber.from(200e6.toString())
      const collateralAmount = await podPut.strikePrice()
      const amountToMint = ethers.BigNumber.from(1e8.toString())
      const deadline = await getTimestamp() + 60

      await strikeAsset.connect(seller).mint(collateralAmount)

      const tx = exchange.connect(seller).sellOptions(
        podPut.address,
        amountToMint,
        outputToken,
        minOutputAmount,
        deadline
      )

      await expect(tx).to.be.revertedWith('Exchange not found')

      // Burn unused tokens
      await strikeAsset.connect(seller).burn(collateralAmount)
    })

    it('fails when the deadline has passed', async () => {
      const outputToken = strikeAsset.address
      const minOutputAmount = ethers.BigNumber.from(200e6.toString())
      const collateralAmount = await podPut.strikePrice()
      const amountToMint = ethers.BigNumber.from(1e8.toString())
      const deadline = await getTimestamp() //

      // Creates the Uniswap exchange
      await createExchange(podPut.address, minOutputAmount)

      await strikeAsset.connect(seller).mint(collateralAmount)
      expect(await strikeAsset.balanceOf(sellerAddress)).to.equal(collateralAmount)

      const tx = exchange.connect(seller).sellOptions(
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
      await createExchange(podPut.address, minAcceptedCost)

      const tx = exchange.connect(seller).buyExactOptions(
        podPut.address,
        amountToBuy,
        inputToken,
        minAcceptedCost,
        deadline
      )

      await expect(tx)
        .to.emit(exchange, 'OptionsBought')
        .withArgs(sellerAddress, podPut.address, amountToBuy, inputToken, minAcceptedCost)
    })

    it('buys options with a exact amount of tokens', async () => {
      const inputToken = strikeAsset.address
      const inputAmount = ethers.BigNumber.from(200e6.toString())
      const minAcceptedOptions = ethers.BigNumber.from(1e8.toString())
      const deadline = await getTimestamp() + 60

      // Creates the Uniswap exchange
      await createExchange(inputToken, minAcceptedOptions)

      const tx = exchange.connect(seller).buyOptionsWithExactTokens(
        podPut.address,
        minAcceptedOptions,
        inputToken,
        inputAmount,
        deadline
      )

      await expect(tx)
        .to.emit(exchange, 'OptionsBought')
        .withArgs(sellerAddress, podPut.address, minAcceptedOptions, inputToken, inputAmount)
    })

    it('fails to buy when the exchange do not exist', async () => {
      const inputToken = strikeAsset.address
      const cost = ethers.BigNumber.from(200e6.toString())
      const amountToBuy = ethers.BigNumber.from(1e8.toString())
      const deadline = await getTimestamp() + 60

      const tx = exchange.connect(seller).buyExactOptions(
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

      const tx = exchange.connect(seller).buyExactOptions(
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
    await ethers.provider.getBlockNumber() + 300 // expirationDate = high block number
  )

  const [deployer] = await ethers.getSigners()
  const filterFrom = await factoryContract.filters.OptionCreated(await deployer.getAddress())
  const eventDetails = await factoryContract.queryFilter(filterFrom, txIdNewOption.blockNumber, txIdNewOption.blockNumber)

  const { option } = eventDetails[0].args
  return await ethers.getContractAt('PodPut', option)
}

async function getTimestamp () {
  const block = await ethers.provider.getBlock('latest')
  return block.timestamp
}
