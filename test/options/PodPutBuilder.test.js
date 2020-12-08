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

describe('PodPutBuilder', function () {
  before(async function () {
    const OptionFactory = await ethers.getContractFactory('PodPutBuilder')
    const MockERC20 = await ethers.getContractFactory('MintableERC20')

    underlyingAsset = await MockERC20.deploy('Wrapped BTC', 'WBTC', 8)
    strikeAsset = await MockERC20.deploy('USDC Token', 'USDC', 6)
    optionFactory = await OptionFactory.deploy()

    await underlyingAsset.mint(1000e8);
    await strikeAsset.mint(1000e8);

    await optionFactory.deployed()
    await underlyingAsset.deployed()
    await strikeAsset.deployed()
  })

  it('Should create a new PodPut Option correctly and not revert', async function () {
    const funcParameters = [ScenarioA.name, ScenarioA.symbol, ScenarioA.exerciseType, underlyingAsset.address, strikeAsset.address, ScenarioA.strikePrice, ScenarioA.expiration, ScenarioA.exerciseWindowSize]

    await expect(optionFactory.buildOption(...funcParameters)).to.not.be.reverted
  })
})
