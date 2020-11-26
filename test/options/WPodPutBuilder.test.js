const { expect } = require('chai')

let optionFactory
let underlyingAsset
let strikeAsset

const OPTION_TYPE_PUT = 0
const EXERCISE_TYPE_EUROPEAN = 0

const ScenarioA = {
  name: 'Pods Put WBTC USDC 5000 2020-06-23',
  symbol: 'podWBTC:20AA',
  optionType: OPTION_TYPE_PUT,
  exerciseType: EXERCISE_TYPE_EUROPEAN,
  strikePrice: 5000000000, // 5000 USDC for 1 unit of WBTC,
  expiration: new Date().getTime() + 5 * 60 * 60 * 1000,
  exerciseWindowSize: 24 * 60 * 60 // 24h
}

describe('WPodPutBuilder', function () {
  before(async function () {
    const OptionFactory = await ethers.getContractFactory('WPodPutBuilder')
    const MockERC20 = await ethers.getContractFactory('MockERC20')
    const MockWETH = await ethers.getContractFactory('WETH')

    const mockWeth = await MockWETH.deploy()
    underlyingAsset = mockWeth
    strikeAsset = await MockERC20.deploy('USDC Token', 'USDC', 6, 1000e8)
    optionFactory = await OptionFactory.deploy(mockWeth.address)

    await optionFactory.deployed()
    await underlyingAsset.deployed()
    await strikeAsset.deployed()
  })

  it('Should create a new WPodPut Option correctly and not revert', async function () {
    const funcParameters = [ScenarioA.name, ScenarioA.symbol, ScenarioA.exerciseType, underlyingAsset.address, strikeAsset.address, ScenarioA.strikePrice, ScenarioA.expiration, ScenarioA.exerciseWindowSize]

    await expect(optionFactory.buildOption(...funcParameters)).to.not.be.reverted
  })
})
