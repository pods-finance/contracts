const { expect } = require('chai')
const createBlackScholes = require('../util/createBlackScholes')
const createConfigurationManager = require('../util/createConfigurationManager')
const { toBigNumber, approximately } = require('../../utils/utils')

const scenarioNextSigma = {
  sigmaLower: ethers.BigNumber.from((1.2428 * 1e18).toString()),
  sigmaHigher: ethers.BigNumber.from((1.36708 * 1e18).toString()),
  priceLower: ethers.BigNumber.from((5.427 * 1e18).toString()),
  priceHigher: ethers.BigNumber.from((6.909 * 1e18).toString()),
  targetPrice: ethers.BigNumber.from((6 * 1e18).toString()),
  expectedNextSigma: '1290851578947368421'
}

const scenarioNewSigma = [
  {
    name: 'using pre-calculated initial guess',
    type: 'put',
    targetPrice: toBigNumber(1275.126573 * 1e18),
    sigmaInitialGuess: toBigNumber(1.2 * 1e18),
    spotPrice: toBigNumber(10500 * 1e18),
    strikePrice: toBigNumber(11000 * 1e18),
    timeToMaturity: toBigNumber(0.03835616438 * 1e18),
    riskFree: toBigNumber(0),
    expectedNewSigma: toBigNumber(1.2 * 1e18)
  },
  {
    name: 'using initial guess > target price (1 iteration)',
    type: 'put',
    targetPrice: toBigNumber(1275.126573 * 1e18),
    sigmaInitialGuess: toBigNumber(1.8 * 1e18),
    spotPrice: toBigNumber(10500 * 1e18),
    strikePrice: toBigNumber(11000 * 1e18),
    timeToMaturity: toBigNumber(0.03835616438 * 1e18),
    riskFree: toBigNumber(0),
    expectedNewSigma: toBigNumber(1.2 * 1e18)
  },
  {
    name: 'using initial guess > target price (n+1 iterations)',
    type: 'put',
    targetPrice: toBigNumber(1275.126573 * 1e18),
    sigmaInitialGuess: toBigNumber(3.8 * 1e18),
    spotPrice: toBigNumber(10500 * 1e18),
    strikePrice: toBigNumber(11000 * 1e18),
    timeToMaturity: toBigNumber(0.03835616438 * 1e18),
    riskFree: toBigNumber(0),
    expectedNewSigma: toBigNumber(1.2 * 1e18)
  },
  {
    name: 'using initial guess < target price (1 iteration)',
    type: 'put',
    targetPrice: toBigNumber(1275.126573 * 1e18),
    sigmaInitialGuess: toBigNumber(1 * 1e18),
    spotPrice: toBigNumber(10500 * 1e18),
    strikePrice: toBigNumber(11000 * 1e18),
    timeToMaturity: toBigNumber(0.03835616438 * 1e18),
    riskFree: toBigNumber(0),
    expectedNewSigma: toBigNumber(1.2 * 1e18)
  },
  {
    name: 'using initial guess < target price (n+1 iterations)',
    type: 'put',
    targetPrice: toBigNumber(1275.126573 * 1e18),
    sigmaInitialGuess: toBigNumber(0.2 * 1e18),
    spotPrice: toBigNumber(10500 * 1e18),
    strikePrice: toBigNumber(11000 * 1e18),
    timeToMaturity: toBigNumber(0.03835616438 * 1e18),
    riskFree: toBigNumber(0),
    expectedNewSigma: toBigNumber(1.2 * 1e18)
  },
  {
    name: 'using call option',
    type: 'call',
    targetPrice: toBigNumber(1275.126573 * 1e18),
    sigmaInitialGuess: toBigNumber(200 * 1e18),
    spotPrice: toBigNumber(28994.01 * 1e18),
    strikePrice: toBigNumber(60000 * 1e18),
    timeToMaturity: toBigNumber(0.1483516483516 * 1e18),
    riskFree: toBigNumber(0),
    expectedNewSigma: toBigNumber(1.2 * 1e18)
  }
]

const initialSigmaNull = {
  targetPrice: toBigNumber(1275.126573 * 1e18),
  sigmaInitialGuess: toBigNumber(0),
  spotPrice: toBigNumber(10500 * 1e18),
  strikePrice: toBigNumber(11000 * 1e18),
  timeToMaturity: toBigNumber(0.03835616438 * 1e18),
  riskFree: toBigNumber(0),
  expectedNewSigma: toBigNumber(1.2 * 1e18)
}

describe('SigmaGuesser', () => {
  let SigmaGuesser, sigmaGuesser, blackScholes, configurationManager

  before(async () => {
    SigmaGuesser = await ethers.getContractFactory('SigmaGuesser')
    blackScholes = await createBlackScholes()
    configurationManager = await createConfigurationManager()
  })

  beforeEach(async () => {
    const parameterName = ethers.utils.formatBytes32String('GUESSER_ACCEPTABLE_RANGE')
    const parameterValue = ethers.BigNumber.from(10)
    await configurationManager.setParameter(parameterName, parameterValue)

    sigmaGuesser = await SigmaGuesser.deploy(configurationManager.address, blackScholes.address)
    await sigmaGuesser.deployed()
  })

  it('should return the assigned sigma', async () => {
    expect(await sigmaGuesser.blackScholes()).to.be.equal(blackScholes.address)
  })

  it('cannot be deployed with a zero-address BlackScholes', async () => {
    const tx = SigmaGuesser.deploy(configurationManager.address, ethers.constants.AddressZero)
    await expect(tx).to.be.revertedWith('Sigma: Invalid blackScholes')
  })

  it('should update the acceptableError correctly from configuratorManager', async () => {
    const parameterName = ethers.utils.formatBytes32String('GUESSER_ACCEPTABLE_RANGE')
    const parameterValue = ethers.BigNumber.from(15)
    await configurationManager.setParameter(parameterName, parameterValue)

    await sigmaGuesser.updateAcceptableRange()
    expect(await sigmaGuesser.acceptableRange()).to.be.equal(parameterValue)
  })

  it('should not update the acceptableError if invalid value came from configuratorManager', async () => {
    const parameterName = ethers.utils.formatBytes32String('GUESSER_ACCEPTABLE_RANGE')
    const parameterValue = ethers.BigNumber.from(5)
    await configurationManager.setParameter(parameterName, parameterValue)

    await expect(sigmaGuesser.updateAcceptableRange()).to.be.revertedWith('Sigma: Invalid acceptableRange')
  })

  describe('FindNextSigma', () => {
    it('Should return the next sigma value correctly', async () => {
      const nextSigma = await sigmaGuesser.getCloserSigma([
        scenarioNextSigma.sigmaLower,
        scenarioNextSigma.priceLower,
        scenarioNextSigma.sigmaHigher,
        scenarioNextSigma.priceHigher
      ], scenarioNextSigma.targetPrice)
      expect(nextSigma).to.equal(scenarioNextSigma.expectedNextSigma)
    })
  })

  describe('FindNewSigma', () => {
    scenarioNewSigma.forEach(scenario => {
      it('Should find the new sigma ' + scenario.name, async () => {
        const method = scenario.type === 'put' ? sigmaGuesser.getPutSigma : sigmaGuesser.getCallSigma
        const res = await method(
          scenario.targetPrice,
          scenario.sigmaInitialGuess,
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

    it('Should revert if initial sigma is 0', async () => {
      await expect(sigmaGuesser.getPutSigma(
        initialSigmaNull.targetPrice,
        initialSigmaNull.sigmaInitialGuess,
        initialSigmaNull.spotPrice,
        initialSigmaNull.strikePrice,
        initialSigmaNull.timeToMaturity,
        initialSigmaNull.riskFree
      )).to.be.revertedWith('Sigma: initial guess should be greater than zero')
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
