
const saveJSON = require('../utils/saveJSON')
const verifyContract = require('../utils/verify')

internalTask('deployIVGuesser', 'Deploy IV Contract')
  .addParam('bs', 'Black Scholes Address')
  .addParam('configuration', 'Configuration Manager Address')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .setAction(async ({ bs, configuration, verify }, hre) => {
    console.log('----Start Deploy IV----')
    const path = `../../deployments/${hre.network.name}.json`
    const IVContract = await ethers.getContractFactory('IVGuesser')
    const ivGuesser = await IVContract.deploy(configuration, bs)

    await ivGuesser.deployed()
    await saveJSON(path, { IVGuesser: ivGuesser.address })

    if (verify) {
      await verifyContract(hre, ivGuesser.address, [configuration, bs])
    }

    console.log('IV Address', ivGuesser.address)
    return ivGuesser.address
  })
