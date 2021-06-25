
// WETH Chainlink source KOVAN: 0x9326BFA02ADD2366b30bacB125260Af641031331
task('setAMMEnvironment', 'deploy and link all main system contracts')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .addParam('asset', 'address of initial asset of the feed (WETH: 0xD7FDf2747A855AC20b96A5cEDeA84b2138cEd280')
  .addParam('source', 'address of the asset price feed (Chainlink WETH/USD: 0x9326BFA02ADD2366b30bacB125260Af641031331')
  .addParam('configuration', 'configuration Manager Address')
  .addOptionalParam('wethadapt', 'adapt weth if usnig in other network')
  .addFlag('builders', 'Also deploy option builders separately')
  .setAction(async ({ asset, source, configuration, builders, wethadapt, verify }, hre) => {
    console.log('----Start Complete Set Environment ----')
    const configurationManagerAddress = configuration

    // 2) Deploy Option Builders + Option Factory
    const optionFactoryAddress = await run('deployOptionFactory', { builders, configuration: configurationManagerAddress, wethadapt, verify })
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
      setter: 'setImpliedVolatility',
      newContract: ivGuesserAddress
    })

    const ivProviderAddress = await hre.run('deployIVProvider', { verify })
    await hre.run('linkConfigurationManager', {
      address: configurationManagerAddress,
      setter: 'setIVProvider',
      newContract: ivProviderAddress
    })

    const priceProviderAddress = await hre.run('deployOracle', { configuration: configurationManagerAddress, asset: asset, source: source, verify })
    await hre.run('linkConfigurationManager', {
      address: configurationManagerAddress,
      setter: 'setPriceProvider',
      newContract: priceProviderAddress
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
