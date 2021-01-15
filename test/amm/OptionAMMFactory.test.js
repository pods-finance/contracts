const { expect } = require('chai')
const createMockOption = require('../util/createMockOption')
const getPriceProviderMock = require('../util/getPriceProviderMock')
const createConfigurationManager = require('../util/createConfigurationManager')

describe('OptionAMMFactory', () => {
  let caller
  let OptionAMMFactory, factory
  let configurationManager, priceProviderMock, mockUnderlyingAsset
  let option
  const initialSigma = '10000000000000000000000'

  before(async () => {
    ;[caller] = await ethers.getSigners()

    ;[OptionAMMFactory, MockERC20, configurationManager] = await Promise.all([
      ethers.getContractFactory('OptionAMMFactory'),
      ethers.getContractFactory('MintableERC20'),
      createConfigurationManager()
    ])

    mockUnderlyingAsset = await MockERC20.deploy('USDC', 'USDC', 6)
    await mockUnderlyingAsset.deployed()

    const mock = await getPriceProviderMock(caller, '900000000000', 8, mockUnderlyingAsset.address)
    priceProviderMock = mock.priceProvider
  })

  beforeEach(async () => {
    factory = await OptionAMMFactory.deploy(configurationManager.address)
    await factory.deployed()

    option = await createMockOption()
  })

  it('should create new pool', async () => {
    const tx = factory.createPool(
      option.address,
      mockUnderlyingAsset.address,
      priceProviderMock.address,
      initialSigma
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
      initialSigma
    )

    const tx = factory.createPool(
      option.address,
      mockUnderlyingAsset.address,
      priceProviderMock.address,
      initialSigma
    )

    await expect(tx).to.be.revertedWith('Pool already exists')
  })

  it('return an existent pool', async () => {
    const tx = factory.createPool(
      option.address,
      mockUnderlyingAsset.address,
      priceProviderMock.address,
      initialSigma
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
