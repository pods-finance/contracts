const saveJSON = require('../utils/saveJSON')
const fs = require('fs')
const pathJoin = require('path')
const fsPromises = fs.promises
const verifyContract = require('../utils/verify')

task('deployOptionAMMFactory', 'Deploy deployOptionAMMFactory Contract')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .addOptionalParam('configuration', 'An address of a deployed ConfigurationManager, defaults to current `deployments` json file')
  .addOptionalParam('feebuilder', 'An address of a deployed FeePoolBuilder, defaults to current `deployments` json file')
  .setAction(async ({ configuration, feebuilder, verify }, bre) => {
    const path = `../../deployments/${bre.network.name}.json`
    console.log('----Start Deploy OptionAMMFactory----')
    let configurationManager = configuration
    const feePoolBuilder = feebuilder
    const _filePath = pathJoin.join(__dirname, path)
    const content = await fsPromises.readFile(_filePath)

    if (!configurationManager) {
      configurationManager = JSON.parse(content).ConfigurationManager
    }

    if (!feePoolBuilder) {
      configurationManager = JSON.parse(content).FeePoolBuilder
    }

    if (configurationManager) {
      const OptionAMMFactory = await ethers.getContractFactory('OptionAMMFactory')
      const optionAMMFactory = await OptionAMMFactory.deploy(configurationManager, feePoolBuilder)

      await optionAMMFactory.deployed()
      console.log('OptionAMMFactory Address', optionAMMFactory.address)

      await saveJSON(path, { OptionAMMFactory: optionAMMFactory.address })

      if (verify) {
        await verifyContract(hre, optionAMMFactory.address, [configurationManager, feePoolBuilder])
      }
      return optionAMMFactory.address
    } else {
      return 'No configuration passed or found'
    }
  })
