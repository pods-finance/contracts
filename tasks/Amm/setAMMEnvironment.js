const saveJSON = require('../utils/saveJSON')

// WETH Chainlink source KOVAN: 0x9326BFA02ADD2366b30bacB125260Af641031331
task('setAMMEnvironment', 'deploy and link all main system contracts')
  .addParam('asset', 'address of initial asset of the feed (WETH: 0xD7FDf2747A855AC20b96A5cEDeA84b2138cEd280')
  .addParam('source', 'address of the asset price feed (Chainlink WETH/USD: ')
  .addParam('configuration', 'configuration Manager Address ')
  .setAction(async ({ asset, source, configuration }, bre) => {
    console.log('----Start Complete Set Environment ----')
    const configurationManagerAddress = configuration

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

    const priceProviderAddress = await bre.run('deployOracle', { asset: asset, source: source })
    await bre.run('linkConfigurationManager', {
      address: configurationManagerAddress,
      setter: 'setPriceProvider',
      newContract: priceProviderAddress
    })

    await bre.run('deployOptionAMMFactory', { configuration: configurationManagerAddress })

    console.log('End of amm environment configuration')
  })
