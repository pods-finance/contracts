const { expect } = require('chai')
const deployBlackScholes = require('./util/deployBlackScholes')
const { toBigNumber, approximately } = require('../utils/utils')

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
    targetPrice: toBigNumber(1275.126573 * 1e18),
    sigmaInitialGuess: toBigNumber(0.2 * 1e18),
    spotPrice: toBigNumber(10500 * 1e18),
    strikePrice: toBigNumber(11000 * 1e18),
    timeToMaturity: toBigNumber(0.03835616438 * 1e18),
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

describe('Sigma', () => {
  let sigma, blackScholes

  before(async () => {
    blackScholes = await deployBlackScholes()
  })

  beforeEach(async () => {
    const SigmaContract = await ethers.getContractFactory('Sigma')
    sigma = await SigmaContract.deploy(blackScholes.address)
    await sigma.deployed()
  })
  describe.only('FindNextSigma', () => {
    it('Should return the next sigma value correctly', async () => {
      const nextSigma = await sigma.findNextSigma(
        scenarioNextSigma.sigmaLower,
        scenarioNextSigma.sigmaHigher,
        scenarioNextSigma.priceLower,
        scenarioNextSigma.priceHigher,
        scenarioNextSigma.targetPrice
      )
      expect(nextSigma).to.equal(scenarioNextSigma.expectedNextSigma)
    })
  })
  describe('FindNewSigma', () => {
    scenarioNewSigma.forEach(scenario => {
      it('Should find the new sigma ' + scenario.name, async () => {
        const res = await sigma.findNewSigmaPut(
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
      await expect(sigma.findNewSigmaPut(
        initialSigmaNull.targetPrice,
        initialSigmaNull.sigmaInitialGuess,
        initialSigmaNull.spotPrice,
        initialSigmaNull.strikePrice,
        initialSigmaNull.timeToMaturity,
        initialSigmaNull.riskFree
      )).to.be.revertedWith('Sigma cant be null')
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
