const { expect } = require('chai')
const { ethers } = require('hardhat')
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

    ;[OptionAMMFactory, MockERC20] = await Promise.all([
      ethers.getContractFactory('OptionAMMFactory'),
      ethers.getContractFactory('MintableERC20')
    ])

    mockUnderlyingAsset = await MockERC20.deploy('USDC', 'USDC', 6)
    await mockUnderlyingAsset.deployed()

    const mock = await getPriceProviderMock(caller, '900000000000', 8, mockUnderlyingAsset.address)
    priceProviderMock = mock.priceProvider

    configurationManager = await createConfigurationManager(priceProviderMock)
  })

  beforeEach(async () => {
    factory = await OptionAMMFactory.deploy(configurationManager.address)
    await factory.deployed()

    option = await createMockOption({ configurationManager })
  })

  it('should create new pool', async () => {
    const tx = factory.createPool(
      option.address,
      mockUnderlyingAsset.address,
      initialSigma
    )
    const pool = await getPoolCreated(factory, tx, caller)

    await expect(tx)
      .to.emit(factory, 'PoolCreated')
      .withArgs(await caller.getAddress(), pool, option.address)
  })

  it('should not deploy a factory without a proper ConfigurationManager', async () => {
    const tx = OptionAMMFactory.deploy(ethers.constants.AddressZero)
    await expect(tx).to.be.revertedWith('OptionAMMFactory: Configuration Manager is not a contract')
  })

  it('should not create the same pool twice', async () => {
    await factory.createPool(
      option.address,
      mockUnderlyingAsset.address,
      initialSigma
    )

    const tx = factory.createPool(
      option.address,
      mockUnderlyingAsset.address,
      initialSigma
    )

    await expect(tx).to.be.revertedWith('Pool already exists')
  })

  it('return an existent pool', async () => {
    const tx = factory.createPool(
      option.address,
      mockUnderlyingAsset.address,
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
