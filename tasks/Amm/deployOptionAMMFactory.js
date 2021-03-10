const saveJSON = require('../utils/saveJSON')
const fs = require('fs')
const pathJoin = require('path')
const fsPromises = fs.promises
const verifyContract = require('../utils/verify')

internalTask('deployOptionAMMFactory', 'Deploy deployOptionAMMFactory Contract')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .addOptionalParam('configuration', 'An address of a deployed ConfigurationManager, defaults to current `deployments` json file')
  .setAction(async ({ configuration, verify }, bre) => {
    const path = `../../deployments/${bre.network.name}.json`
    console.log('----Start Deploy OptionAMMFactory----')
    let configurationManager = configuration

    if (!configurationManager) {
      const _filePath = pathJoin.join(__dirname, path)
      const content = await fsPromises.readFile(_filePath)
      configurationManager = JSON.parse(content).configurationManager
    }

    if (configurationManager) {
      const OptionAMMFactory = await ethers.getContractFactory('OptionAMMFactory')
      const optionAMMFactory = await OptionAMMFactory.deploy(configurationManager)

      await optionAMMFactory.deployed()
      console.log('OptionAMMFactory Address', optionAMMFactory.address)

      await saveJSON(path, { optionAMMFactory: optionAMMFactory.address })

      if (verify) {
        await verifyContract(hre, optionAMMFactory.address, [configurationManager])
      }
      return optionAMMFactory.address
    } else {
      return 'No configuration passed or found'
    }
  })
