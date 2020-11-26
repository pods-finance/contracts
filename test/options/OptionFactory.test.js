const { expect } = require('chai')

let optionFactory
let underlyingAsset
let strikeAsset
let mockWeth

const ScenarioA = {
  name: 'Pods Put WBTC USDC 5000 2020-06-23',
  symbol: 'podWBTC:20AA',
  optionType: 0,
  strikePrice: 5000000000, // 5000 USDC for 1 unit of WBTC,
  expiration: new Date().getTime() + 5 * 60 * 60 * 1000,
  exerciseWindowSize: 24 * 60 * 60 // 24h
}

describe('OptionFactory', function () {
  before(async function () {
    const OptionFactory = await ethers.getContractFactory('OptionFactory')
    const PodPutFactory = await ethers.getContractFactory('PodPutBuilder')
    const WPodPutFactory = await ethers.getContractFactory('WPodPutBuilder')
    const MockERC20 = await ethers.getContractFactory('MockERC20')
    const MockWETH = await ethers.getContractFactory('WETH')

    mockWeth = await MockWETH.deploy()
    underlyingAsset = await MockERC20.deploy('Wrapped BTC', 'WBTC', 8, 1000e8)
    strikeAsset = await MockERC20.deploy('USDC Token', 'USDC', 6, 1000e8)

    const podPutFactory = await PodPutFactory.deploy()
    await podPutFactory.deployed()
    const wPodPutFactory = await WPodPutFactory.deploy(mockWeth.address)
    await wPodPutFactory.deployed()
    optionFactory = await OptionFactory.deploy(mockWeth.address, podPutFactory.address, wPodPutFactory.address)

    await optionFactory.deployed()
    await underlyingAsset.deployed()
    await strikeAsset.deployed()
  })

  it('Should create a new PodPut Option correctly and emit event', async function () {
    const funcParameters = [ScenarioA.name, ScenarioA.symbol, ScenarioA.optionType, underlyingAsset.address, strikeAsset.address, ScenarioA.strikePrice, ScenarioA.expiration, ScenarioA.exerciseWindowSize]

    await expect(optionFactory.createOption(...funcParameters)).to.emit(optionFactory, 'OptionCreated')
  })

  it('Should create a new WPodPut Option correctly and emit event', async function () {
    const funcParameters = [ScenarioA.name, ScenarioA.symbol, ScenarioA.optionType, mockWeth.address, strikeAsset.address, ScenarioA.strikePrice, ScenarioA.expiration, ScenarioA.exerciseWindowSize]

    await expect(optionFactory.createOption(...funcParameters)).to.emit(optionFactory, 'OptionCreated')
  })
})
