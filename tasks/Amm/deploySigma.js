
const saveJSON = require('../utils/saveJSON')

internalTask('deploySigma', 'Deploy Sigma Contract')
  .addParam('bs', 'Black Scholes Address')
  .setAction(async ({ bs }, bre) => {
    console.log('----Start Deploy Sigma----')
    const path = `../../deployments/${bre.network.name}.json`
    const SigmaContract = await ethers.getContractFactory('Sigma')
    const sigma = await SigmaContract.deploy(bs)

    await sigma.deployed()
    await saveJSON(path, { sigma: sigma.address })
    console.log('Sigma Address', sigma.address)
    return sigma.address
  })
