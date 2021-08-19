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

    console.log('----End Deploy ConfigurationManager + Emergency + Cap----')
    return configurationManagerAddress
  })
