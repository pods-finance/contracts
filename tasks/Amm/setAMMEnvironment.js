const saveJSON = require('../utils/saveJSON')

// WETH Chainlink source KOVAN: 0x9326BFA02ADD2366b30bacB125260Af641031331
task('setAMMEnvironment', 'deploy and link all main system contracts')
  .addParam('asset', 'address of initial asset of the feed (WETH: 0xD7FDf2747A855AC20b96A5cEDeA84b2138cEd280')
  .addParam('source', 'address of the asset price feed (Chainlink WETH/USD: ')
  .addParam('configuration', 'configuration Manager Address ')
  .setAction(async ({ asset, source, configuration }, hre) => {
    console.log('----Start Complete Set Environment ----')
    const configurationManagerAddress = configuration

    const normalDistAddress = await hre.run('deployNormalDistribution')
    const bsAddress = await hre.run('deployBS', { normaldist: normalDistAddress, deploylibs: true })
    await hre.run('linkConfigurationManager', {
      address: configurationManagerAddress,
      setter: 'setPricingMethod',
      newContract: bsAddress
    })

    const sigmaAddress = await hre.run('deploySigma', { bs: bsAddress })
    await hre.run('linkConfigurationManager', {
      address: configurationManagerAddress,
      setter: 'setImpliedVolatility',
      newContract: sigmaAddress
    })

    const priceProviderAddress = await hre.run('deployOracle', { asset: asset, source: source })
    await hre.run('linkConfigurationManager', {
      address: configurationManagerAddress,
      setter: 'setPriceProvider',
      newContract: priceProviderAddress
    })

    const optionAMMFactory = await hre.run('deployOptionAMMFactory', { configuration: configurationManagerAddress })
    await hre.run('deployOptionExchange', { factory: optionAMMFactory })

    console.log('End of amm environment configuration')
  })
