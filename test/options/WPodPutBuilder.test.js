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
  exerciseWindowSize: 24 * 60 * 60, // 24h
  cap: ethers.BigNumber.from(20e8.toString())
}

describe('WPodPutBuilder', function () {
  let optionFactory
  let underlyingAsset
  let strikeAsset
  let configurationManager

  before(async function () {
    const OptionFactory = await ethers.getContractFactory('WPodPutBuilder')
    const MintableERC20 = await ethers.getContractFactory('MintableERC20')

    underlyingAsset = await MintableERC20.deploy('WBTC Token', 'USDC', 8)
    strikeAsset = await MintableERC20.deploy('USDC Token', 'USDC', 6)
    optionFactory = await OptionFactory.deploy()

    await optionFactory.deployed()
    await underlyingAsset.deployed()
    await strikeAsset.deployed()

    configurationManager = await createConfigurationManager()
  })

  it('Should create a new WPodPut Option correctly and not revert', async function () {
    const funcParameters = [ScenarioA.name, ScenarioA.symbol, ScenarioA.exerciseType, underlyingAsset.address, strikeAsset.address, ScenarioA.strikePrice, ScenarioA.expiration, ScenarioA.exerciseWindowSize, configurationManager.address]

    await expect(optionFactory.buildOption(...funcParameters)).to.not.be.reverted
  })
})
