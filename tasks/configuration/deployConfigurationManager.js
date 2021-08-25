const { getDeployments } = require('../utils/deployment')

task('deployConfigurationManager', 'Deploy a new instance of ConfigurationManager + Emergency + Cap and link them')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .setAction(async ({ verify }, hre) => {
    console.log('----Start Deploy ConfigurationManager + Emergency + Cap----')

    const configurationManagerAddress = await hre.run('deploy', {
      name: 'ConfigurationManager',
      save: true,
      verify
    })

    const emergencyStopAddress = await hre.run('deploy', {
      name: 'EmergencyStop',
      save: true,
      verify
    })

    await hre.run('linkConfigurationManager', {
      address: configurationManagerAddress,
      setter: 'setEmergencyStop',
      newContract: emergencyStopAddress
    })

    const capProviderAddress = await hre.run('deploy', {
      name: 'CapProvider',
      save: true,
      verify
    })

    await hre.run('linkConfigurationManager', {
      address: configurationManagerAddress,
      setter: 'setCapProvider',
      newContract: capProviderAddress
    })

    const priceProviderAddress = await hre.run('deploy', {
      name: 'PriceProvider',
      save: true,
      args: [configurationManagerAddress, [], []],
      verify
    })

    await hre.run('linkConfigurationManager', {
      address: configurationManagerAddress,
      setter: 'setPriceProvider',
      newContract: priceProviderAddress
    })

    const optionPoolRegistryAddress = await hre.run('deploy', {
      name: 'OptionPoolRegistry',
      save: true,
      args: [configurationManagerAddress],
      verify
    })

    await hre.run('linkConfigurationManager', {
      address: configurationManagerAddress,
      setter: 'setOptionPoolRegistry',
      newContract: optionPoolRegistryAddress
    })

    // Network-specific configurations
    if (hre.network.name === 'kovan') {
      const deployments = getDeployments()
      await hre.run('setParameter', {
        parameter: 'WRAPPED_NETWORK_TOKEN',
        value: deployments.WETH,
        configuration: configurationManagerAddress
      })

      await hre.run('setParameter', {
        parameter: 'MIN_UPDATE_INTERVAL',
        value: '2678400',
        configuration: configurationManagerAddress
      })
    } else if (hre.network.name === 'mumbai') {
      const deployments = getDeployments()
      await hre.run('setParameter', {
        parameter: 'WRAPPED_NETWORK_TOKEN',
        value: deployments.WMATIC,
        configuration: configurationManagerAddress
      })

      await hre.run('setParameter', {
        parameter: 'MIN_UPDATE_INTERVAL',
        value: '2678400',
        configuration: configurationManagerAddress
      })
    } else if (hre.network.name === 'matic') {
      const deployments = getDeployments()
      await hre.run('setParameter', {
        parameter: 'WRAPPED_NETWORK_TOKEN',
        value: deployments.WMATIC,
        configuration: configurationManagerAddress
      })
    }

    console.log('----End Deploy ConfigurationManager + Emergency + Cap----')
    return configurationManagerAddress
  })
