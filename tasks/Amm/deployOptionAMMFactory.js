const saveJSON = require('../utils/saveJSON')

internalTask('deployOptionAMMFactory', 'Deploy deployOptionAMMFactory Contract')
  .addOptionalParam('configurationManager', 'An address of a deployed ConfigurationManager, defaults to current `deployments` json file')
  .setAction(async ({ configurationManager }, bre) => {
    const path = `../../deployments/${bre.network.name}.json`
    console.log('----Start Deploy OptionAMMFactory----')

    if (!configurationManager) {
      const json = require(path)
      configurationManager = json.configurationManager
    }

    const OptionAMMFactory = await ethers.getContractFactory('OptionAMMFactory')
    const optionAMMFactory = await OptionAMMFactory.deploy(configurationManager)

    await optionAMMFactory.deployed()
    console.log('OptionAMMFactory Address', optionAMMFactory.address)

    await saveJSON(path, { optionAMMFactory: optionAMMFactory.address })
    return optionAMMFactory.address
  })
