const { expect } = require('chai')
const createConfigurationManager = require('../util/createConfigurationManager')

let optionFactory
let underlyingAsset
let strikeAsset
let mockWeth

const OPTION_TYPE_PUT = 0
const OPTION_TYPE_CALL = 1
const EXERCISE_TYPE_EUROPEAN = 0

const ScenarioA = {
  name: 'Pods Put WBTC USDC 5000 2020-06-23',
  symbol: 'podWBTC:20AA',
  exerciseType: EXERCISE_TYPE_EUROPEAN,
  strikePrice: 5000000000, // 5000 USDC for 1 unit of WBTC,
  expiration: new Date().getTime() + 24 * 60 * 60 * 7,
  exerciseWindowSize: 24 * 60 * 60 // 24h
}

describe('OptionFactory', function () {
  before(async function () {
    const [PodPutBuilder, WPodPutBuilder, AavePodPutBuilder, PodCallBuilder, WPodCallBuilder, AavePodCallBuilder, OptionFactory] = await Promise.all([
      ethers.getContractFactory('PodPutBuilder'),
      ethers.getContractFactory('WPodPutBuilder'),
      ethers.getContractFactory('AavePodPutBuilder'),
      ethers.getContractFactory('PodCallBuilder'),
      ethers.getContractFactory('WPodCallBuilder'),
      ethers.getContractFactory('AavePodCallBuilder'),
      ethers.getContractFactory('OptionFactory')
    ])
    const MintableERC20 = await ethers.getContractFactory('MintableERC20')
    const MockWETH = await ethers.getContractFactory('WETH')
    const configurationManager = await createConfigurationManager()

    mockWeth = await MockWETH.deploy()
    underlyingAsset = await MintableERC20.deploy('Wrapped BTC', 'WBTC', 8)
    strikeAsset = await MintableERC20.deploy('USDC Token', 'USDC', 6)

    const podPutBuilder = await PodPutBuilder.deploy()
    const wPodPutBuilder = await WPodPutBuilder.deploy()
    const aavePodPutBuilder = await AavePodPutBuilder.deploy()
    const podCallBuilder = await PodCallBuilder.deploy()
    const wPodCallBuilder = await WPodCallBuilder.deploy()
    const aavePodCallBuilder = await AavePodCallBuilder.deploy()

    optionFactory = await OptionFactory.deploy(
      podPutBuilder.address,
      wPodPutBuilder.address,
      aavePodPutBuilder.address,
      podCallBuilder.address,
      wPodCallBuilder.address,
      aavePodCallBuilder.address,
      configurationManager.address
    )

    await optionFactory.deployed()
    await underlyingAsset.deployed()
    await strikeAsset.deployed()
  })

  it('Should create a new PodPut Option correctly and emit event', async function () {
    const funcParameters = [ScenarioA.name, ScenarioA.symbol, OPTION_TYPE_PUT, ScenarioA.exerciseType, underlyingAsset.address, strikeAsset.address, ScenarioA.strikePrice, ScenarioA.expiration, ScenarioA.exerciseWindowSize, false]

    await expect(optionFactory.createOption(...funcParameters)).to.emit(optionFactory, 'OptionCreated')
  })

  it('Should create a new WPodPut Option correctly and emit event', async function () {
    const funcParameters = [ScenarioA.name, ScenarioA.symbol, OPTION_TYPE_PUT, ScenarioA.exerciseType, mockWeth.address, strikeAsset.address, ScenarioA.strikePrice, ScenarioA.expiration, ScenarioA.exerciseWindowSize, false]

    await expect(optionFactory.createOption(...funcParameters)).to.emit(optionFactory, 'OptionCreated')
  })

  it('Should create a new AavePodPut Option correctly and emit event', async function () {
    const funcParameters = [ScenarioA.name, ScenarioA.symbol, OPTION_TYPE_PUT, ScenarioA.exerciseType, mockWeth.address, strikeAsset.address, ScenarioA.strikePrice, ScenarioA.expiration, ScenarioA.exerciseWindowSize, true]

    await expect(optionFactory.createOption(...funcParameters)).to.emit(optionFactory, 'OptionCreated')
  })

  it('Should create a new PodCall Option correctly and emit event', async function () {
    const funcParameters = [ScenarioA.name, ScenarioA.symbol, OPTION_TYPE_CALL, ScenarioA.exerciseType, underlyingAsset.address, strikeAsset.address, ScenarioA.strikePrice, ScenarioA.expiration, ScenarioA.exerciseWindowSize, false]

    await expect(optionFactory.createOption(...funcParameters)).to.emit(optionFactory, 'OptionCreated')
  })

  it('Should create a new WPodCall Option correctly and emit event', async function () {
    const funcParameters = [ScenarioA.name, ScenarioA.symbol, OPTION_TYPE_CALL, ScenarioA.exerciseType, mockWeth.address, strikeAsset.address, ScenarioA.strikePrice, ScenarioA.expiration, ScenarioA.exerciseWindowSize, false]

    await expect(optionFactory.createOption(...funcParameters)).to.emit(optionFactory, 'OptionCreated')
  })

  it('Should create a new AavePodCall Option correctly and emit event', async function () {
    const funcParameters = [ScenarioA.name, ScenarioA.symbol, OPTION_TYPE_CALL, ScenarioA.exerciseType, mockWeth.address, strikeAsset.address, ScenarioA.strikePrice, ScenarioA.expiration, ScenarioA.exerciseWindowSize, true]

    await expect(optionFactory.createOption(...funcParameters)).to.emit(optionFactory, 'OptionCreated')
  })
})
