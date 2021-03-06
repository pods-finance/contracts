const { expect } = require('chai')
const { ethers } = require('hardhat')
const createMockOption = require('../util/createMockOption')
const getPriceProviderMock = require('../util/getPriceProviderMock')
const createConfigurationManager = require('../util/createConfigurationManager')

describe('OptionAMMFactory', () => {
  let caller
  let OptionAMMFactory, FeePoolBuilder, factory, feePoolBuilder
  let configurationManager, priceProviderMock, mockUnderlyingAsset
  let option
  const initialIV = '10000000000000000000000'

  before(async () => {
    ;[caller] = await ethers.getSigners()

    ;[OptionAMMFactory, FeePoolBuilder, MockERC20] = await Promise.all([
      ethers.getContractFactory('OptionAMMFactory'),
      ethers.getContractFactory('FeePoolBuilder'),
      ethers.getContractFactory('MintableERC20')
    ])

    feePoolBuilder = await FeePoolBuilder.deploy()
    mockUnderlyingAsset = await MockERC20.deploy('USDC', 'USDC', 6)
    await mockUnderlyingAsset.deployed()

    configurationManager = await createConfigurationManager()

    const mock = await getPriceProviderMock({
      deployer: caller,
      price: '900000000000',
      decimals: 8,
      tokenAddress: mockUnderlyingAsset.address,
      configurationManager
    })
    priceProviderMock = mock.priceProvider
    await configurationManager.setPriceProvider(priceProviderMock.address)
  })

  beforeEach(async () => {
    factory = await OptionAMMFactory.deploy(configurationManager.address, feePoolBuilder.address)
    await factory.deployed()

    option = await createMockOption({ configurationManager })
  })

  it('should create new pool', async () => {
    const tx = factory.createPool(
      option.address,
      mockUnderlyingAsset.address,
      initialIV
    )
    const pool = await getPoolCreated(factory, tx, caller)

    await expect(tx)
      .to.emit(factory, 'PoolCreated')
      .withArgs(await caller.getAddress(), pool, option.address)
  })

  it('should not deploy a factory without a proper ConfigurationManager', async () => {
    await expect(
      OptionAMMFactory.deploy(ethers.constants.AddressZero, feePoolBuilder.address)
    ).to.be.revertedWith('OptionAMMFactory: Configuration Manager is not a contract')

    await expect(
      OptionAMMFactory.deploy(await caller.getAddress(), feePoolBuilder.address)
    ).to.be.revertedWith('OptionAMMFactory: Configuration Manager is not a contract')
  })

  it('should not deploy a factory without a proper FeePoolBuilder', async () => {
    await expect(
      OptionAMMFactory.deploy(configurationManager.address, ethers.constants.AddressZero)
    ).to.be.revertedWith('OptionAMMFactory: FeePoolBuilder is not a contract')

    await expect(
      OptionAMMFactory.deploy(configurationManager.address, await caller.getAddress())
    ).to.be.revertedWith('OptionAMMFactory: FeePoolBuilder is not a contract')
  })

  it('should not create the same pool twice', async () => {
    await factory.createPool(
      option.address,
      mockUnderlyingAsset.address,
      initialIV
    )

    const tx = factory.createPool(
      option.address,
      mockUnderlyingAsset.address,
      initialIV
    )

    await expect(tx).to.be.revertedWith('Pool already exists')
  })

  it('return an existent pool', async () => {
    const tx = factory.createPool(
      option.address,
      mockUnderlyingAsset.address,
      initialIV
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
