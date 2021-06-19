const { expect } = require('chai')
const { toBigNumber, approximately } = require('../../utils/utils')
const INT256_MAX = toBigNumber(2).pow(255)

const scenarios = [
  {
    type: 'put',
    spotPrice: toBigNumber(368 * 1e18),
    strikePrice: toBigNumber(320 * 1e18),
    iv: toBigNumber(0.8 * 1e18),
    riskFree: toBigNumber(0),
    time: toBigNumber(0.009589041096 * 1e18), // 3.5 days
    expectedPrice: toBigNumber(0.3391972191 * 1e18)
  },
  {
    type: 'put',
    spotPrice: toBigNumber(10500 * 1e18),
    strikePrice: toBigNumber(11000 * 1e18),
    iv: toBigNumber(1.2 * 1e18),
    riskFree: toBigNumber(0),
    time: toBigNumber(0.03835616438 * 1e18), // 3.5 days
    expectedPrice: toBigNumber(1275.126573 * 1e18)
  },
  {
    type: 'put', // Call price should be 0
    spotPrice: toBigNumber(320 * 1e18),
    strikePrice: toBigNumber(300 * 1e18),
    iv: toBigNumber(0.6 * 1e18),
    riskFree: toBigNumber(0),
    time: toBigNumber(11).mul(1e14), // 0.0011
    expectedPrice: toBigNumber(0.0004 * 1e18)
  },
  {
    type: 'call',
    spotPrice: toBigNumber(601 * 1e18),
    strikePrice: toBigNumber(580 * 1e18),
    iv: toBigNumber(0.824 * 1e18),
    riskFree: toBigNumber(0),
    time: toBigNumber(0.02283105023 * 1e18), // 3.5 days
    expectedPrice: toBigNumber(40.99782 * 1e18)
  },
  {
    type: 'call',
    spotPrice: toBigNumber(601 * 1e18),
    strikePrice: toBigNumber(660 * 1e18),
    iv: toBigNumber(0.824 * 1e18),
    riskFree: toBigNumber(0),
    time: toBigNumber(0.0114155251141553 * 1e18), // 3.5 days
    expectedPrice: toBigNumber(4.0835637054095 * 1e18)
  },
  {
    type: 'call', // Call price should be 0
    spotPrice: toBigNumber(300 * 1e18),
    strikePrice: toBigNumber(320 * 1e18),
    iv: toBigNumber(0.6 * 1e18),
    riskFree: toBigNumber(0),
    time: toBigNumber(11).mul(1e14), // 0.0011
    expectedPrice: toBigNumber(0.0004 * 1e18)
  }
]

describe('BlackScholes', () => {
  let BlackScholes, bs, normalDistribution

  before(async () => {
    const NormalDistribution = await ethers.getContractFactory('NormalDistribution')
    normalDistribution = await NormalDistribution.deploy()

    BlackScholes = await ethers.getContractFactory('BlackScholes')
  })

  beforeEach(async () => {
    bs = await BlackScholes.deploy(normalDistribution.address)
    await normalDistribution.deployed()
  })

  it('cannot create a pool with a zero-address normalDistribution', async () => {
    const tx = BlackScholes.deploy(ethers.constants.AddressZero)
    await expect(tx).to.be.revertedWith('BlackScholes: Invalid normalDistribution')
  })

  it('should revert if casting uint to int overflow', async () => {
    await expect(bs.getPutPrice(
      scenarios[0].spotPrice,
      scenarios[0].strikePrice,
      scenarios[0].iv,
      INT256_MAX,
      scenarios[0].riskFree
    )).to.be.revertedWith('BlackScholes: casting overflow')
  })

  scenarios.forEach(scenario => {
    it(`Calculates the ${scenario.type} price correctly`, async () => {
      const method = scenario.type === 'put' ? bs.getPutPrice : bs.getCallPrice
      const price = await method(
        scenario.spotPrice,
        scenario.strikePrice,
        scenario.iv,
        scenario.time,
        scenario.riskFree
      )

      console.log(`\t${scenario.type} price:              ${price}`)
      console.log(`\tscenario.expectedPrice: ${scenario.expectedPrice}`)

      expect(approximately(scenario.expectedPrice, price)).to.equal(true)
    })
  })
})
