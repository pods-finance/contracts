const { expect } = require('chai')
const createMockOption = require('../util/createMockOption')
const deployBlackScholes = require('../util/deployBlackScholes')
const getPriceProviderMock = require('../util/getPriceProviderMock')

describe('OptionAMMFactory', () => {
  let caller
  let OptionAMMFactory, factory
  let blackScholes, priceProviderMock, sigma, mockUnderlyingAsset
  let option
  const initialSigma = '10000000000000000000000'

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
    const mock = await getPriceProviderMock(caller, '900000000000', 8, mockUnderlyingAsset.address)
    priceProviderMock = mock.priceProvider

    sigma = await Sigma.deploy(blackScholes.address)
  })

  beforeEach(async () => {
    factory = await OptionAMMFactory.deploy()
    await factory.deployed()

    option = await createMockOption()
  })

  it('should create new pool', async () => {
    const tx = factory.createPool(
      option.address,
      mockUnderlyingAsset.address,
      priceProviderMock.address,
      blackScholes.address,
      sigma.address,
      initialSigma,
      5000e6
    )
    const pool = await getPoolCreated(factory, tx, caller)

    await expect(tx)
      .to.emit(factory, 'PoolCreated')
      .withArgs(await caller.getAddress(), pool)
  })

  it('should not create the same pool twice', async () => {
    await factory.createPool(
      option.address,
      mockUnderlyingAsset.address,
      priceProviderMock.address,
      blackScholes.address,
      sigma.address,
      initialSigma,
      5000e6
    )

    const tx = factory.createPool(
      option.address,
      mockUnderlyingAsset.address,
      priceProviderMock.address,
      blackScholes.address,
      sigma.address,
      initialSigma,
      5000e6
    )

    await expect(tx).to.be.revertedWith('Pool already exists')
  })

  it('return a existent pool', async () => {
    const tx = factory.createPool(
      option.address,
      mockUnderlyingAsset.address,
      priceProviderMock.address,
      blackScholes.address,
      sigma.address,
      initialSigma,
      5000e6
    )

    const pool = await getPoolCreated(factory, tx, caller)

    expect(await factory.getPool(option.address)).to.be.equal(pool)
  })
})

async function getPoolCreated (factory, tx, caller) {
  const receipt = await tx
  const filterFrom = await factory.filters.PoolCreated(await caller.getAddress())
  const eventDetails = await factory.queryFilter(filterFrom, receipt.blockNumber, receipt.blockNumber)
  const { pool } = eventDetails[0].args
  return pool
}
