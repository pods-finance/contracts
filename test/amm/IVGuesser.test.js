const { expect } = require('chai')
const createBlackScholes = require('../util/createBlackScholes')
const createConfigurationManager = require('../util/createConfigurationManager')
const { toBigNumber, approximately } = require('../../utils/utils')

const scenarioNextIV = {
  ivLower: ethers.BigNumber.from((1.2428 * 1e18).toString()),
  ivHigher: ethers.BigNumber.from((1.36708 * 1e18).toString()),
  priceLower: ethers.BigNumber.from((5.427 * 1e18).toString()),
  priceHigher: ethers.BigNumber.from((6.909 * 1e18).toString()),
  targetPrice: ethers.BigNumber.from((6 * 1e18).toString()),
  expectedNextIV: '1290851578947368421'
}

const scenarioNewIV = [
  {
    name: 'using pre-calculated initial guess',
    type: 'put',
    targetPrice: toBigNumber(1275.126573 * 1e18),
    initialIVGuess: toBigNumber(1.2 * 1e18),
    spotPrice: toBigNumber(10500 * 1e18),
    strikePrice: toBigNumber(11000 * 1e18),
    timeToMaturity: toBigNumber(0.03835616438 * 1e18),
    riskFree: toBigNumber(0),
    expectedNewIV: toBigNumber(1.2 * 1e18)
  },
  {
    name: 'using initial guess > target price (1 iteration)',
    type: 'put',
    targetPrice: toBigNumber(1275.126573 * 1e18),
    initialIVGuess: toBigNumber(1.8 * 1e18),
    spotPrice: toBigNumber(10500 * 1e18),
    strikePrice: toBigNumber(11000 * 1e18),
    timeToMaturity: toBigNumber(0.03835616438 * 1e18),
    riskFree: toBigNumber(0),
    expectedNewIV: toBigNumber(1.2 * 1e18)
  },
  {
    name: 'using initial guess > target price (n+1 iterations)',
    type: 'put',
    targetPrice: toBigNumber(1275.126573 * 1e18),
    initialIVGuess: toBigNumber(3.8 * 1e18),
    spotPrice: toBigNumber(10500 * 1e18),
    strikePrice: toBigNumber(11000 * 1e18),
    timeToMaturity: toBigNumber(0.03835616438 * 1e18),
    riskFree: toBigNumber(0),
    expectedNewIV: toBigNumber(1.2 * 1e18)
  },
  {
    name: 'using initial guess < target price (1 iteration)',
    type: 'put',
    targetPrice: toBigNumber(1275.126573 * 1e18),
    initialIVGuess: toBigNumber(1 * 1e18),
    spotPrice: toBigNumber(10500 * 1e18),
    strikePrice: toBigNumber(11000 * 1e18),
    timeToMaturity: toBigNumber(0.03835616438 * 1e18),
    riskFree: toBigNumber(0),
    expectedNewIV: toBigNumber(1.2 * 1e18)
  },
  {
    name: 'using initial guess < target price (n+1 iterations)',
    type: 'put',
    targetPrice: toBigNumber(1275.126573 * 1e18),
    initialIVGuess: toBigNumber(0.2 * 1e18),
    spotPrice: toBigNumber(10500 * 1e18),
    strikePrice: toBigNumber(11000 * 1e18),
    timeToMaturity: toBigNumber(0.03835616438 * 1e18),
    riskFree: toBigNumber(0),
    expectedNewIV: toBigNumber(1.2 * 1e18)
  },
  {
    name: 'using call option',
    type: 'call',
    targetPrice: toBigNumber(1275.126573 * 1e18),
    initialIVGuess: toBigNumber(200 * 1e18),
    spotPrice: toBigNumber(28994.01 * 1e18),
    strikePrice: toBigNumber(60000 * 1e18),
    timeToMaturity: toBigNumber(0.1483516483516 * 1e18),
    riskFree: toBigNumber(0),
    expectedNewIV: toBigNumber(1.2 * 1e18)
  }
]

const initialIVNull = {
  targetPrice: toBigNumber(1275.126573 * 1e18),
  initialIVGuess: toBigNumber(0),
  spotPrice: toBigNumber(10500 * 1e18),
  strikePrice: toBigNumber(11000 * 1e18),
  timeToMaturity: toBigNumber(0.03835616438 * 1e18),
  riskFree: toBigNumber(0),
  expectedNewIV: toBigNumber(1.2 * 1e18)
}

describe('IVGuesser', () => {
  let IVGuesser, ivGuesser, blackScholes, configurationManager

  before(async () => {
    IVGuesser = await ethers.getContractFactory('IVGuesser')
    blackScholes = await createBlackScholes()
    configurationManager = await createConfigurationManager()
  })

  beforeEach(async () => {
    const parameterName = ethers.utils.formatBytes32String('GUESSER_ACCEPTABLE_RANGE')
    const parameterValue = ethers.BigNumber.from(10)
    await configurationManager.setParameter(parameterName, parameterValue)

    ivGuesser = await IVGuesser.deploy(configurationManager.address, blackScholes.address)
    await ivGuesser.deployed()
  })

  it('should return the assigned IV', async () => {
    expect(await ivGuesser.blackScholes()).to.be.equal(blackScholes.address)
  })

  it('cannot be deployed with a zero-address BlackScholes', async () => {
    const tx = IVGuesser.deploy(configurationManager.address, ethers.constants.AddressZero)
    await expect(tx).to.be.revertedWith('IV: Invalid blackScholes')
  })

  it('should update the acceptableError correctly from configuratorManager', async () => {
    const parameterName = ethers.utils.formatBytes32String('GUESSER_ACCEPTABLE_RANGE')
    const parameterValue = ethers.BigNumber.from(15)
    await configurationManager.setParameter(parameterName, parameterValue)

    await ivGuesser.updateAcceptableRange()
    expect(await ivGuesser.acceptableRange()).to.be.equal(parameterValue)
  })

  it('should not update the acceptableError if invalid value came from configuratorManager', async () => {
    const parameterName = ethers.utils.formatBytes32String('GUESSER_ACCEPTABLE_RANGE')
    const parameterValue = ethers.BigNumber.from(5)
    await configurationManager.setParameter(parameterName, parameterValue)

    await expect(ivGuesser.updateAcceptableRange()).to.be.revertedWith('IV: Invalid acceptableRange')
  })

  describe('FindNextIV', () => {
    it('Should return the next IV value correctly', async () => {
      const nextIV = await ivGuesser.getCloserIV([
        scenarioNextIV.ivLower,
        scenarioNextIV.priceLower,
        scenarioNextIV.ivHigher,
        scenarioNextIV.priceHigher
      ], scenarioNextIV.targetPrice)
      expect(nextIV).to.equal(scenarioNextIV.expectedNextIV)
    })
  })

  describe('FindNewIV', () => {
    scenarioNewIV.forEach(scenario => {
      it('Should find the new IV ' + scenario.name, async () => {
        const method = scenario.type === 'put' ? ivGuesser.getPutIV : ivGuesser.getCallIV
        const res = await method(
          scenario.targetPrice,
          scenario.initialIVGuess,
          scenario.spotPrice,
          scenario.strikePrice,
          scenario.timeToMaturity,
          scenario.riskFree
        )
        const newPrice = res[1]
        console.log('newPrice: ' + newPrice.toString())
        console.log('targetPrice: ' + scenario.targetPrice)
        console.log('error ' + calculateError(scenario.targetPrice, newPrice) + '%')
        expect(approximately(newPrice, scenario.targetPrice)).to.equal(true)
      })
    })

    it('Should revert if initial IV is 0', async () => {
      await expect(ivGuesser.getPutIV(
        initialIVNull.targetPrice,
        initialIVNull.initialIVGuess,
        initialIVNull.spotPrice,
        initialIVNull.strikePrice,
        initialIVNull.timeToMaturity,
        initialIVNull.riskFree
      )).to.be.revertedWith('IV: initial guess should be greater than zero')
    })
  })
})

function calculateError (target, value) {
  let percentage
  if (target.eq(value)) return 0
  if (target.gte(value)) {
    const diff = target.sub(value)
    percentage = (diff.mul(100).div(target)).toString()
  } else {
    const diff = value.sub(target)
    percentage = (diff.mul(100).div(target)).toString()
  }
  return percentage
}
