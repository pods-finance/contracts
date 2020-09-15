const { expect } = require('chai')

let optionFactory
let underlyingAsset
let strikeAsset

const ScenarioA = {
  name: 'Pods Put WBTC USDC 5000 2020-06-23',
  symbol: 'podWBTC:20AA',
  optionType: 1,
  strikePrice: 5000000000, // 5000 USDC for 1 unit of WBTC,
  expiration: new Date().getTime() + 5 * 60 * 60 * 1000
}

describe('OptionFactory', function () {
  before(async function () {
    const OptionFactory = await ethers.getContractFactory('OptionFactory')
    const MockERC20 = await ethers.getContractFactory('MockERC20')
    const MockWETH = await ethers.getContractFactory('WETH')

    const mockWeth = await MockWETH.deploy()
    underlyingAsset = await MockERC20.deploy('Wrapped BTC', 'WBTC', 8, 1000e8)
    strikeAsset = await MockERC20.deploy('USDC Token', 'USDC', 6, 1000e8)
    optionFactory = await OptionFactory.deploy(mockWeth.address)

    await optionFactory.deployed()
    await underlyingAsset.deployed()
    await strikeAsset.deployed()
  })

  it('Should create a new Option correctly and emit event', async function () {
    const funcParameters = [ScenarioA.name, ScenarioA.symbol, ScenarioA.optionType, underlyingAsset.address, strikeAsset.address, ScenarioA.strikePrice, ScenarioA.expiration]

    await expect(optionFactory.createOption(...funcParameters)).to.emit(optionFactory, 'OptionCreated')
  })

  it('Should revert if calling createOption with block lower than currentBlock', async function () {
    // Changing the last parameter to a block that for sure is lower than the current one
    const funcParameters = [ScenarioA.name, ScenarioA.symbol, ScenarioA.optionType, underlyingAsset.address, strikeAsset.address, ScenarioA.strikePrice, 1]

    await expect(optionFactory.createOption(...funcParameters)).to.be.revertedWith('Expiration should be in the future time')
  })
})
