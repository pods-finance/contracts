const saveJSON = require('./utils/saveJSON')

task('deployOptionHelper', 'Deploy new option helper using provider')
  .addParam('factory', 'Address of the factory to pass to initialize')
  .setAction(async ({ factory }, bre) => {
    console.log('----Start Deploy OptionHelper----')
    const path = `../../deployments/${bre.network.name}.json`
    const OptionHelper = await ethers.getContractFactory('OptionHelper')
    const optionHelper = await OptionHelper.deploy(factory)
    console.log('Option Helper Address: ', optionHelper.address)

    await saveJSON(path, { optionHelper: optionHelper.address })
    return optionHelper.address
  })
