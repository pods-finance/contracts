const { expect } = require('chai')
const createMockOption = require('./util/createMockOption')
const deployBlackScholes = require('./util/deployBlackScholes')
const getPriceProviderMock = require('./util/getPriceProviderMock')

describe('OptionAMMFactory', () => {
  let caller
  let OptionAMMFactory, factory
  let blackScholes, priceProviderMock, sigma, mockUnderlyingAsset
  let option

  before(async () => {
    ;[caller] = await ethers.getSigners()

    ;[OptionAMMFactory, MockERC20, Sigma] = await Promise.all([
      ethers.getContractFactory('OptionAMMFactory'),
      ethers.getContractFactory('MintableERC20'),
      ethers.getContractFactory('Sigma')
    ])

    mockUnderlyingAsset = await MockERC20.deploy('USDC', 'USDC', 6)
    await mockUnderlyingAsset.deployed()

    blackScholes = await deployBlackScholes()
    const mock = await getPriceProviderMock(caller, '900000000000', mockUnderlyingAsset.address)
    priceProviderMock = mock.priceProvider

    sigma = await Sigma.deploy(blackScholes.address)
  })

  beforeEach(async () => {
    factory = await OptionAMMFactory.deploy()
    await factory.deployed()

    option = await createMockOption()
  })

  it('should create new exchange', async () => {
    const tx = factory.createExchange(
      option.address,
      mockUnderlyingAsset.address,
      priceProviderMock.address,
      blackScholes.address,
      sigma.address
    )
    const exchange = await getExchangeCreated(factory, tx, caller)

    await expect(tx)
      .to.emit(factory, 'ExchangeCreated')
      .withArgs(await caller.getAddress(), exchange)
  })

  it('should not create the same exchange twice', async () => {
    await factory.createExchange(
      option.address,
      mockUnderlyingAsset.address,
      priceProviderMock.address,
      blackScholes.address,
      sigma.address
    )

    const tx = factory.createExchange(
      option.address,
      mockUnderlyingAsset.address,
      priceProviderMock.address,
      blackScholes.address,
      sigma.address
    )

    await expect(tx).to.be.revertedWith('Exchange already exists')
  })

  it('return a existent exchange', async () => {
    const tx = factory.createExchange(
      option.address,
      mockUnderlyingAsset.address,
      priceProviderMock.address,
      blackScholes.address,
      sigma.address
    )

    const exchange = await getExchangeCreated(factory, tx, caller)

    expect(await factory.getExchange(option.address)).to.be.equal(exchange)
  })
})

async function getExchangeCreated (factory, tx, caller) {
  const receipt = await tx
  const filterFrom = await factory.filters.ExchangeCreated(await caller.getAddress())
  const eventDetails = await factory.queryFilter(filterFrom, receipt.blockNumber, receipt.blockNumber)
  const { exchange } = eventDetails[0].args
  return exchange
}
