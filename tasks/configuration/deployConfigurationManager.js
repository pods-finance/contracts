const saveJSON = require('../utils/saveJSON')

task('deployConfigurationManager', 'Deploy a new instance of ConfigurationManager')
  .setAction(async ({}, bre) => {

    const [ConfigurationManager, EmergencyStop, CapProvider, PriceProvider] = await Promise.all([
      ethers.getContractFactory('ConfigurationManager'),
      ethers.getContractFactory('EmergencyStop'),
      ethers.getContractFactory('CapProvider'),
      ethers.getContractFactory('PriceProvider'),
    ])

    const configurationManager = await ConfigurationManager.deploy()
    await configurationManager.deployed()
    const configurationManagerAddress = configurationManager.address

    await saveJSON(`../../deployments/${bre.network.name}.json`, { configurationManager: configurationManager.address })
    console.log(`ConfigurationManager deployed to: ${configurationManagerAddress}`)

    const emergencyStop = await EmergencyStop.deploy()
    await emergencyStop.deployed()
    await bre.run('linkConfigurationManager', {
      address: configurationManagerAddress,
      setter: 'setEmergencyStop',
      newContract: emergencyStop.address
    })

    const capProvider = await CapProvider.deploy()
    await capProvider.deployed()
    await bre.run('linkConfigurationManager', {
      address: configurationManagerAddress,
      setter: 'setCapProvider',
      newContract: capProvider.address
    })

    const normalDistAddress = await bre.run('deployNormalDistribution')
    const bsAddress = await bre.run('deployBS', { normaldist: normalDistAddress, deploylibs: true })
    await bre.run('linkConfigurationManager', {
      address: configurationManagerAddress,
      setter: 'setPricingMethod',
      newContract: bsAddress
    })

    const sigmaAddress = await bre.run('deploySigma', { bs: bsAddress })
    await bre.run('linkConfigurationManager', {
      address: configurationManagerAddress,
      setter: 'setImpliedVolatility',
      newContract: sigmaAddress
    })

    const priceProvider = await PriceProvider.deploy([], [])
    await priceProvider.deployed()
    await bre.run('linkConfigurationManager', {
      address: configurationManagerAddress,
      setter: 'setPriceProvider',
      newContract: priceProvider.address
    })

    return configurationManager.address
  })
