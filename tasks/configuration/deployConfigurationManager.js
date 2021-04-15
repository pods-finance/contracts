const saveJSON = require('../utils/saveJSON')
const verifyContract = require('../utils/verify')

task('deployConfigurationManager', 'Deploy a new instance of ConfigurationManager + Emergency + Cap and link them')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .setAction(async ({ verify }, hre) => {
    hre.run('compile')
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

    await hre.run('linkConfigurationManager', {
      address: configurationManagerAddress,
      setter: 'setEmergencyStop',
      newContract: emergencyStop.address
    })

    const capProvider = await CapProvider.deploy()
    await capProvider.deployed()
    console.log('capProvider Address', capProvider.address)

    await hre.run('linkConfigurationManager', {
      address: configurationManagerAddress,
      setter: 'setCapProvider',
      newContract: capProvider.address
    })

    const saveObj = {
      configurationManager: configurationManager.address,
      emergencyStop: emergencyStop.address,
      capProvider: capProvider.address
    }

    await saveJSON(`../../deployments/${hre.network.name}.json`, saveObj)

    if (verify) {
      await verifyContract(hre, configurationManager.address)
      await verifyContract(hre, emergencyStop.address)
      await verifyContract(hre, capProvider.address)
    }

    console.log('----End Deploy ConfiguratorManager + Emergency + Cap----')
    return configurationManager.address
  })
