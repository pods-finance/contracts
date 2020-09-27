const { expect } = require('chai')

const scenarioNextSigma = {
  sigmaLower: ethers.BigNumber.from((1.2428 * 1e18).toString()),
  sigmaHigher: ethers.BigNumber.from((1.36708 * 1e18).toString()),
  priceLower: ethers.BigNumber.from((5.427 * 1e18).toString()),
  priceHigher: ethers.BigNumber.from((6.909 * 1e18).toString()),
  targetPrice: ethers.BigNumber.from((6 * 1e18).toString()),
  expectedNextSigma: '1290851578947368421'
}

// const scenarioNewSigma = {
//   targetPrice: ethers.BigNumber.from((1.2428 * 1e18).toString()),
//   sigmaInitialGuess: ethers.BigNumber.from((1.36708 * 1e18).toString()),
//   lastSigma: ethers.BigNumber.from((5.427 * 1e18).toString()),
//   lastPrice: ethers.BigNumber.from((6.909 * 1e18).toString()),
//   spotPrice: '1290851578947368421',
//   strikePrice: '1290851578947368421'
// }

describe.only('Sigma', () => {
  let sigma

  beforeEach(async () => {
    const SigmaContract = await ethers.getContractFactory('Sigma')
    sigma = await SigmaContract.deploy()
    await sigma.deployed()
  })

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
  //   it('Should find the new sigma when passing initial guess', async () => {
  //     const newSigma = await sigma.findNewSigma(
  //       scenarioNewSigma.spotPrice,
  //       scenarioNewSigma.strikePrice,
  //       scenarioNewSigma.sigma,
  //       scenarioNewSigma.riskFree,
  //       scenarioNewSigma.daysRemaining
  //     )

  //     expect(newSigma).to.equal(newSigma.expectedNewSigma)
  //   })
  //   it('Should find the new sigma with initial guess 0', async () => {
  //     const putPrice = await sigma.getPutPrice(
  //       scenario.spotPrice,
  //       scenario.strikePrice,
  //       scenario.sigma,
  //       scenario.riskFree,
  //       scenario.daysRemaining
  //     )

  //     expect(putPrice).to.equal(scenario.expectedPutPrice)
  //   })
  //   it('Should find the new sigma with very high initial guess', async () => {
  //     const putPrice = await sigma.getPutPrice(
  //       scenario.spotPrice,
  //       scenario.strikePrice,
  //       scenario.sigma,
  //       scenario.riskFree,
  //       scenario.daysRemaining
  //     )

//     expect(putPrice).to.equal(scenario.expectedPutPrice)
//   })
})
