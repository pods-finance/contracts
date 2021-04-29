
const saveJSON = require('../utils/saveJSON')
const verifyContract = require('../utils/verify')

internalTask('deploySigmaGuesser', 'Deploy Sigma Contract')
  .addParam('bs', 'Black Scholes Address')
  .addParam('configuration', 'Configuration Manager Address')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .setAction(async ({ bs, configuration, verify }, hre) => {
    console.log('----Start Deploy Sigma----')
    const path = `../../deployments/${hre.network.name}.json`
    const SigmaContract = await ethers.getContractFactory('SigmaGuesser')
    const sigmaGuesser = await SigmaContract.deploy(configuration, bs)

    await sigmaGuesser.deployed()
    await saveJSON(path, { sigmaGuesser: sigmaGuesser.address })

    if (verify) {
      await verifyContract(hre, sigmaGuesser.address, [configuration, bs])
    }

    console.log('Sigma Address', sigmaGuesser.address)
    return sigmaGuesser.address
  })
