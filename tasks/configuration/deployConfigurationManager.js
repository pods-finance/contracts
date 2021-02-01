const saveJSON = require('../utils/saveJSON')

task('deployConfigurationManager', 'Deploy a new instance of ConfigurationManager + Emergency + Cap and link them')
  .setAction(async ({}, bre) => {
    console.log('----Start Deploy ConfiguratorManager + Emergency + Cap----')
    const [ConfigurationManager, EmergencyStop, CapProvider] = await Promise.all([
      ethers.getContractFactory('ConfigurationManager'),
      ethers.getContractFactory('EmergencyStop'),
      ethers.getContractFactory('CapProvider')
    ])

    const configurationManager = await ConfigurationManager.deploy()
    await configurationManager.deployed()
    const configurationManagerAddress = configurationManager.address
    console.log('configurationManager Address', configurationManager.address)

    const emergencyStop = await EmergencyStop.deploy()
    await emergencyStop.deployed()
    console.log('emergencyStop Address', emergencyStop.address)

    await bre.run('linkConfigurationManager', {
      address: configurationManagerAddress,
      setter: 'setEmergencyStop',
      newContract: emergencyStop.address
    })

    const capProvider = await CapProvider.deploy()
    await capProvider.deployed()
    console.log('capProvider Address', capProvider.address)

    await bre.run('linkConfigurationManager', {
      address: configurationManagerAddress,
      setter: 'setCapProvider',
      newContract: capProvider.address
    })

    const saveObj = {
      configurationManager: configurationManager.address,
      emergencyStop: emergencyStop.address,
      capProvider: capProvider.address
    }

    await saveJSON(`../../deployments/${bre.network.name}.json`, saveObj)
    console.log('----End Deploy ConfiguratorManager + Emergency + Cap----')
    return configurationManager.address
  })
