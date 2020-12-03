const { expect } = require('chai')
const getContractFactoryWithLibraries = require('../util/getContractFactoryWithLibraries')
const { toBigNumber, approximately } = require('../../utils/utils')

const scenarios = [
  {
    type: 'PUT',
    spotPrice: toBigNumber(368 * 1e18),
    strikePrice: toBigNumber(320 * 1e18),
    sigma: toBigNumber(0.8 * 1e18),
    riskFree: toBigNumber(0),
    time: toBigNumber(0.009589041096 * 1e18), // 3.5 days
    expectedPrice: toBigNumber(0.3991972191 * 1e18)
  },
  {
    type: 'PUT',
    spotPrice: toBigNumber(10500 * 1e18),
    strikePrice: toBigNumber(11000 * 1e18),
    sigma: toBigNumber(1.2 * 1e18),
    riskFree: toBigNumber(0),
    time: toBigNumber(0.03835616438 * 1e18), // 3.5 days
    expectedPrice: toBigNumber(1275.126573 * 1e18)
  },
  {
    type: 'CALL',
    spotPrice: toBigNumber(601 * 1e18),
    strikePrice: toBigNumber(580 * 1e18),
    sigma: toBigNumber(0.824 * 1e18),
    riskFree: toBigNumber(0),
    time: toBigNumber(0.02283105023 * 1e18), // 3.5 days
    expectedPrice: toBigNumber(40.99782 * 1e18)
  },
  {
    type: 'CALL',
    spotPrice: toBigNumber(601 * 1e18),
    strikePrice: toBigNumber(660 * 1e18),
    sigma: toBigNumber(0.824 * 1e18),
    riskFree: toBigNumber(0),
    time: toBigNumber(0.0114155251141553 * 1e18), // 3.5 days
    expectedPrice: toBigNumber(4.0835637054095 * 1e18)
  }
]

describe('BlackScholes', () => {
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
      ExponentLib: exponent.address
    })
  })

  beforeEach(async () => {
    bs = await BlackScholes.deploy(normalDistribution.address)
    await normalDistribution.deployed()
  })

  scenarios.filter(scenario => scenario.type === 'PUT').forEach(scenario => {
    it('Calculated the put price correctly', async () => {
      const putPrice = await bs.getPutPrice(
        scenario.spotPrice,
        scenario.strikePrice,
        scenario.sigma,
        scenario.time,
        scenario.riskFree
      )

      console.log(`\tPut price: ${putPrice}`)

      expect(approximately(scenario.expectedPrice, putPrice)).to.equal(true)
    })
  })

  scenarios.filter(scenario => scenario.type === 'CALL').forEach(scenario => {
    it('Calculated the call price correctly', async () => {
      const callPrice = await bs.getCallPrice(
        scenario.spotPrice,
        scenario.strikePrice,
        scenario.sigma,
        scenario.time,
        scenario.riskFree
      )

      console.log(`\Call price: ${callPrice}`)

      expect(approximately(scenario.expectedPrice, callPrice)).to.equal(true)
    })
  })
})
