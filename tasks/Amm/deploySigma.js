
const saveJSON = require('../utils/saveJSON')
const verifyContract = require('../utils/verify')

internalTask('deploySigma', 'Deploy Sigma Contract')
  .addParam('bs', 'Black Scholes Address')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .setAction(async ({ bs, verify }, hre) => {
    console.log('----Start Deploy Sigma----')
    const path = `../../deployments/${hre.network.name}.json`
    const SigmaContract = await ethers.getContractFactory('Sigma')
    const sigma = await SigmaContract.deploy(bs)

    await sigma.deployed()
    await saveJSON(path, { sigma: sigma.address })

    if (verify) {
      await verifyContract(hre, sigma.address, [bs])
    }

    console.log('Sigma Address', sigma.address)
    return sigma.address
  })
