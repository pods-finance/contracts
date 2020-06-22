const { expect } = require('chai')

let podFactory
let underlyingAsset
let strikeAsset

const ScenarioA = {
  name: 'Pods Put WBTC USDC 5000 2020-06-23',
  symbol: 'podWBTC:20AA',
  optionType: 1,
  strikePrice: 5000000000, // 5000 USDC for 1 unit of WBTC,
  expirationDate: 100000
}

describe('PodFactory', function () {
  before(async function () {
    const PodFactory = await ethers.getContractFactory('PodFactory')
    const MockERC20 = await ethers.getContractFactory('MockERC20')
    podFactory = await PodFactory.deploy()
    underlyingAsset = await MockERC20.deploy('Wrapped BTC', 'WBTC', 8, 1000e8)
    strikeAsset = await MockERC20.deploy('USDC Token', 'USDC', 6, 1000e8)

    await podFactory.deployed()
    await underlyingAsset.deployed()
    await strikeAsset.deployed()
  })

  it('Should start with a empty options array', async function () {
    expect(await podFactory.getNumberOfOptions()).to.equal(0)
  })

  it('Should create a new Option correctly, emit event and increase options array', async function () {
    const funcParameters = [ScenarioA.name, ScenarioA.symbol, ScenarioA.optionType, underlyingAsset.address, strikeAsset.address, ScenarioA.strikePrice, ScenarioA.expirationDate]

    await expect(podFactory.createOption(...funcParameters)).to.emit(podFactory, 'OptionCreated')
    expect(await podFactory.getNumberOfOptions()).to.equal(1)
  })

  it('Should revert if calling createOption with block lower than currentBlock', async function () {
    // Changing the last parameter to a block that for sure is lower than the current one
    const funcParameters = [ScenarioA.name, ScenarioA.symbol, ScenarioA.optionType, underlyingAsset.address, strikeAsset.address, ScenarioA.strikePrice, 1]

    await expect(podFactory.createOption(...funcParameters)).to.be.revertedWith('expiration lower than current block')
  })
})
