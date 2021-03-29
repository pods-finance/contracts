
const saveJSON = require('../utils/saveJSON')
const verifyContract = require('../utils/verify')

internalTask('deploySigma', 'Deploy Sigma Contract')
  .addParam('bs', 'Black Scholes Address')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .setAction(async ({ bs, verify }, hre) => {
    console.log('----Start Deploy Sigma----')
    const path = `../../deployments/${hre.network.name}.json`
    const SigmaContract = await ethers.getContractFactory('SigmaGuesser')
    const sigmaGuesser = await SigmaContract.deploy(bs)

    await sigmaGuesser.deployed()
    await saveJSON(path, { sigmaGuesser: sigmaGuesser.address })

    if (verify) {
      await verifyContract(hre, sigmaGuesser.address, [bs])
    }

    console.log('Sigma Address', sigmaGuesser.address)
    return sigmaGuesser.address
  })
