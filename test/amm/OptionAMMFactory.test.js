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
    await configurationManager.setAMMFactory(factory.address)

    option = await createMockOption({ configurationManager })
  })

  it('should create new pool', async () => {
    const tx = factory.createPool(
      option.address,
      mockUnderlyingAsset.address,
      initialIV
    )
    const pool = await getPoolCreated(tx, option, configurationManager)
    const registry = await ethers.getContractAt('OptionPoolRegistry', await configurationManager.getOptionPoolRegistry())

    await expect(tx)
      .to.emit(registry, 'PoolSet')
      .withArgs(factory.address, option.address, pool.address)
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

    const pool = await getPoolCreated(tx, option, configurationManager)
    const registry = await ethers.getContractAt('OptionPoolRegistry', await configurationManager.getOptionPoolRegistry())

    expect(await registry.getPool(option.address)).to.be.equal(pool.address)
  })
})

async function getPoolCreated (tx, option, configurationManager) {
  const optionAMMFactory = await ethers.getContractAt('OptionAMMFactory', await configurationManager.getAMMFactory())
  const registry = await ethers.getContractAt('OptionPoolRegistry', await configurationManager.getOptionPoolRegistry())
  const filter = await registry.filters.PoolSet(optionAMMFactory.address, option.address)
  const events = await registry.queryFilter(filter, tx.blockNumber, tx.blockNumber)

  const { pool } = events[0].args
  return await ethers.getContractAt('OptionAMMPool', pool)
}
