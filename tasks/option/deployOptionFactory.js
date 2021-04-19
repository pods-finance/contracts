const saveJSON = require('../utils/saveJSON')
const fs = require('fs')
const pathJoin = require('path')
const fsPromises = fs.promises
const verifyContract = require('../utils/verify')

task('deployOptionFactory', 'Deploy OptionFactory')
  .addFlag('builders', 'true if want to deploy all builders combined')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .addOptionalParam('configuration', 'An address of a deployed ConfigurationManager, defaults to current `deployments` json file')
  .addOptionalParam('podputbuilder', 'podputbuilder contract address')
  .addOptionalParam('wpodputbuilder', 'wpodputbuilder contract address')
  .addOptionalParam('podcallbuilder', 'podcallbuilder contract address')
  .addOptionalParam('wpodcallbuilder', 'wpodcallbuilder contract address')
  .addOptionalParam('wethadapt', 'alternative weth address in case of other networks')

  .setAction(async ({ podputbuilder, wpodputbuilder, podcallbuilder, wpodcallbuilder, configuration, builders, wethadapt, verify }, hre) => {
    const path = `../../deployments/${hre.network.name}.json`
    const _filePath = pathJoin.join(__dirname, path)
    const content = await fsPromises.readFile(_filePath)
    const wethAddress = wethadapt || JSON.parse(content).WETH
    const configurationManager = configuration || JSON.parse(content).configurationManager

    if (!configurationManager) {
      throw Error('Configuration Manager not found')
    }

    if (builders) {
      podputbuilder = await run('deployBuilder', { optiontype: 'PodPut' })
      wpodputbuilder = await run('deployBuilder', { optiontype: 'WPodPut' })
      podcallbuilder = await run('deployBuilder', { optiontype: 'PodCall' })
      wpodcallbuilder = await run('deployBuilder', { optiontype: 'WPodCall' })
    }

    const OptionFactory = await ethers.getContractFactory('OptionFactory')

    const constructorElements = [
      wethAddress,
      podputbuilder,
      wpodputbuilder,
      podcallbuilder,
      wpodcallbuilder,
      configurationManager
    ]

    const factory = await OptionFactory.deploy(...constructorElements)

    await factory.deployed()

    await saveJSON(path, { optionFactory: factory.address })

    if (verify) {
      await verifyContract(hre, factory.address, constructorElements)

      if (builders) {
        await verifyContract(hre, podputbuilder)
        await verifyContract(hre, wpodputbuilder)
        await verifyContract(hre, podcallbuilder)
        await verifyContract(hre, wpodcallbuilder)
      }
    }

    console.log('OptionFactory deployed to: ', factory.address)
    return factory.address
  })
