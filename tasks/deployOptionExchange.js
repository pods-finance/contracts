const saveJSON = require('./utils/saveJSON')
const verifyContract = require('./utils/verify')

task('deployOptionHelper', 'Deploy new option helper using provider')
  .addParam('factory', 'Address of the factory to pass to initialize')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .setAction(async ({ factory, verify }, hre) => {
    console.log('----Start Deploy OptionHelper----')
    const path = `../../deployments/${hre.network.name}.json`
    const OptionHelper = await ethers.getContractFactory('OptionHelper')
    const optionHelper = await OptionHelper.deploy(factory)
    console.log('Option Helper Address: ', optionHelper.address)

    await saveJSON(path, { optionHelper: optionHelper.address })

    if (verify) {
      await verifyContract(hre, optionHelper.address, [factory])
    }

    return optionHelper.address
  })
