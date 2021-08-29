
// WETH Chainlink source KOVAN: 0x9326BFA02ADD2366b30bacB125260Af641031331
task('setAMMEnvironment', 'deploy and link all main system contracts')
  .addParam('configuration', 'configuration Manager Address')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .addFlag('builders', 'Also deploy option builders separately')
  .setAction(async ({configuration, builders, verify }, hre) => {
    console.log('----Start Complete Set Environment ----')
    const configurationManagerAddress = configuration

    // 2) Deploy Option Builders + Option Factory
    const optionFactoryAddress = await run('deployOptionFactory', { builders, configuration: configurationManagerAddress, verify })
    await hre.run('linkConfigurationManager', {
      address: configurationManagerAddress,
      setter: 'setOptionFactory',
      newContract: optionFactoryAddress
    })

    const normalDistAddress = await hre.run('deployNormalDistribution', { verify })
    const bsAddress = await hre.run('deployBS', { normaldist: normalDistAddress, verify })
    await hre.run('linkConfigurationManager', {
      address: configurationManagerAddress,
      setter: 'setPricingMethod',
      newContract: bsAddress
    })

    const ivGuesserAddress = await hre.run('deployIVGuesser', { configuration: configurationManagerAddress, bs: bsAddress, verify })
    await hre.run('linkConfigurationManager', {
      address: configurationManagerAddress,
      setter: 'setIVGuesser',
      newContract: ivGuesserAddress
    })

    const ivProviderAddress = await hre.run('deployIVProvider', { verify })
    await hre.run('linkConfigurationManager', {
      address: configurationManagerAddress,
      setter: 'setIVProvider',
      newContract: ivProviderAddress
    })

    const feeBuilderAddress = await hre.run('deploy', { name: 'FeePoolBuilder', verify, save: true })

    const optionAMMFactoryAddress = await hre.run('deployOptionAMMFactory', { configuration: configurationManagerAddress, feebuilder: feeBuilderAddress, verify })
    await hre.run('linkConfigurationManager', {
      address: configurationManagerAddress,
      setter: 'setAMMFactory',
      newContract: optionAMMFactoryAddress
    })

    const optionHelperAddress = await hre.run('deployOptionHelper', { configuration: configurationManagerAddress, verify })
    await hre.run('linkConfigurationManager', {
      address: configurationManagerAddress,
      setter: 'setOptionHelper',
      newContract: optionHelperAddress
    })

    console.log('End of amm environment configuration')
  })
