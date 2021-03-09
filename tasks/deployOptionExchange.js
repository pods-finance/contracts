const saveJSON = require('./utils/saveJSON')

task('deployOptionHelper', 'Deploy new option helper using provider')
  .addParam('factory', 'Address of the factory to pass to initialize')
  .setAction(async ({ factory }, bre) => {
    console.log('----Start Deploy OptionHelper----')
    const path = `../../deployments/${bre.network.name}.json`
    const OptionHelper = await ethers.getContractFactory('OptionHelper')
    const helper = await OptionHelper.deploy(factory)
    console.log('Option Helper Address: ', helper.address)

    await saveJSON(path, { helper: helper.address })
    return helper.address
  })
