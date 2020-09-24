const { expect } = require('chai')
const getContractFactoryWithLibraries = require('./util/getContractFactoryWithLibraries')

const scenarios = [
  {
    spotPrice: ethers.BigNumber.from((368 * 1e18).toString()),
    strikePrice: ethers.BigNumber.from((320 * 1e18).toString()),
    sigma: ethers.BigNumber.from((1.18 * 1e18).toString()),
    riskFree: ethers.BigNumber.from(0),
    daysRemaining: ethers.BigNumber.from((6.5 * 1e18).toString()),
    expectedPutPrice: ethers.BigNumber.from((5.8 * 1e18).toString())
  }
]

describe.only('BlackScholes', () => {
  let BlackScholes, bs, normalDistribution

  before(async () => {
    const FixidityLib = await ethers.getContractFactory('FixidityLib')
    const fixidity = await FixidityLib.deploy()
    await fixidity.deployed()

    const LogarithmLib = await getContractFactoryWithLibraries('LogarithmLib', {
      FixidityLib: fixidity.address
    })
    const logarithm = await LogarithmLib.deploy()
    await logarithm.deployed()

    const ExponentLib = await getContractFactoryWithLibraries('ExponentLib', {
      FixidityLib: fixidity.address,
      LogarithmLib: logarithm.address
    })
    const exponent = await ExponentLib.deploy()
    await exponent.deployed()

    const NormalDistribution = await ethers.getContractFactory('NormalDistribution')
    normalDistribution = await NormalDistribution.deploy()
    await normalDistribution.deployed()

    BlackScholes = await getContractFactoryWithLibraries('BlackScholes', {
      FixidityLib: fixidity.address,
      LogarithmLib: logarithm.address,
      ExponentLib: exponent.address,
    })
  })

  beforeEach(async () => {
    bs = await BlackScholes.deploy(normalDistribution.address)
  })

  scenarios.forEach(scenario => {
    it('returns the put price', async () => {
      const putPrice = await bs.getPutPrice(
        scenario.spotPrice,
        scenario.strikePrice,
        scenario.sigma,
        scenario.riskFree,
        scenario.daysRemaining
      )

      expect(putPrice).to.equal(scenario.expectedPutPrice)
    })
  })
})
