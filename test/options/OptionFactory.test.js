const { expect } = require('chai')
const createConfigurationManager = require('../util/createConfigurationManager')

const OPTION_TYPE_PUT = 0
const EXERCISE_TYPE_EUROPEAN = 0

const ScenarioA = {
  name: 'Pods Put WBTC USDC 5000 2020-06-23',
  symbol: 'podWBTC:20AA',
  optionType: OPTION_TYPE_PUT,
  exerciseType: EXERCISE_TYPE_EUROPEAN,
  strikePrice: 5000000000, // 5000 USDC for 1 unit of WBTC,
  expiration: new Date().getTime() + 24 * 60 * 60 * 7,
  exerciseWindowSize: 24 * 60 * 60 // 24h
}

describe('OptionFactory', function () {
  let optionFactory
  let underlyingAsset
  let strikeAsset
  let mockWeth
  let sender

  before(async function () {
    ;[sender] = await ethers.getSigners()
    const [PodPutBuilder, WPodPutBuilder, PodCallBuilder, WPodCallBuilder, OptionFactory] = await Promise.all([
      ethers.getContractFactory('PodPutBuilder'),
      ethers.getContractFactory('WPodPutBuilder'),
      ethers.getContractFactory('PodCallBuilder'),
      ethers.getContractFactory('WPodCallBuilder'),
      ethers.getContractFactory('OptionFactory')
    ])
    const MintableERC20 = await ethers.getContractFactory('MintableERC20')
    const MockWETH = await ethers.getContractFactory('WETH')
    const configurationManager = await createConfigurationManager()

    mockWeth = await MockWETH.deploy()
    underlyingAsset = await MintableERC20.deploy('Wrapped BTC', 'WBTC', 8)
    strikeAsset = await MintableERC20.deploy('USDC Token', 'USDC', 6)

    await underlyingAsset.mint(1000e8);
    await strikeAsset.mint(1000e8);

    const podPutFactory = await PodPutBuilder.deploy()
    await podPutFactory.deployed()
    const wPodPutFactory = await WPodPutBuilder.deploy()
    await wPodPutFactory.deployed()
    const podCallFactory = await PodCallBuilder.deploy()
    await podPutFactory.deployed()
    const wPodCallFactory = await WPodCallBuilder.deploy()
    await wPodPutFactory.deployed()

    optionFactory = await OptionFactory.deploy(
      mockWeth.address,
      podPutFactory.address,
      wPodPutFactory.address,
      podCallFactory.address,
      wPodCallFactory.address,
      configurationManager.address
    )

    await configurationManager.setOptionFactory(optionFactory.address)

    await optionFactory.deployed()
    await underlyingAsset.deployed()
    await strikeAsset.deployed()
  })

  it('Should create a new PodPut Option correctly and emit event', async function () {
    const tx = await optionFactory.createOption(
      ScenarioA.name,
      ScenarioA.symbol,
      ScenarioA.optionType,
      ScenarioA.exerciseType,
      underlyingAsset.address,
      strikeAsset.address,
      ScenarioA.strikePrice,
      ScenarioA.expiration,
      ScenarioA.exerciseWindowSize
    )

    const optionAddress = await getOptionCreated(optionFactory, tx, sender)

    await expect(tx).to.emit(optionFactory, 'OptionCreated')

    const option = await ethers.getContractAt('PodOption', optionAddress)
    expect(await option.factory()).to.be.equal(optionFactory.address)
  })

  it('Should create a new WPodPut Option correctly and emit event', async function () {
    const tx = await optionFactory.createOption(
      ScenarioA.name,
      ScenarioA.symbol,
      ScenarioA.optionType,
      ScenarioA.exerciseType,
      mockWeth.address,
      strikeAsset.address,
      ScenarioA.strikePrice,
      ScenarioA.expiration,
      ScenarioA.exerciseWindowSize
    )

    const optionAddress = await getOptionCreated(optionFactory, tx, sender)

    await expect(tx).to.emit(optionFactory, 'OptionCreated')

    const option = await ethers.getContractAt('PodOption', optionAddress)
    expect(await option.factory()).to.be.equal(optionFactory.address)
  })

  it('Should create a new PodCall Option correctly and emit event', async function () {
    const tx = await optionFactory.createOption(
      ScenarioA.name,
      ScenarioA.symbol,
      1,
      ScenarioA.exerciseType,
      underlyingAsset.address,
      strikeAsset.address,
      ScenarioA.strikePrice,
      ScenarioA.expiration,
      ScenarioA.exerciseWindowSize
    )

    const optionAddress = await getOptionCreated(optionFactory, tx, sender)

    await expect(tx).to.emit(optionFactory, 'OptionCreated')

    const option = await ethers.getContractAt('PodOption', optionAddress)
    expect(await option.factory()).to.be.equal(optionFactory.address)
  })

  it('Should create a new WPodCall Option correctly and emit event', async function () {
    const tx = await optionFactory.createOption(
      ScenarioA.name,
      ScenarioA.symbol,
      1,
      ScenarioA.exerciseType,
      mockWeth.address,
      strikeAsset.address,
      ScenarioA.strikePrice,
      ScenarioA.expiration,
      ScenarioA.exerciseWindowSize
    )

    const optionAddress = await getOptionCreated(optionFactory, tx, sender)

    await expect(tx).to.emit(optionFactory, 'OptionCreated')

    const option = await ethers.getContractAt('PodOption', optionAddress)
    expect(await option.factory()).to.be.equal(optionFactory.address)
  })
})

async function getOptionCreated (factory, tx, caller) {
  const receipt = await tx
  const filterFrom = await factory.filters.OptionCreated(await caller.getAddress())
  const eventDetails = await factory.queryFilter(filterFrom, receipt.blockNumber, receipt.blockNumber)
  const { option } = eventDetails[0].args
  return option
}
