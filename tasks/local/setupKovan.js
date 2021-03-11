task('setupKovan', 'Deploy a whole local Kovan environment')
  .addParam('asset', 'address of initial asset of the feed (WETH: 0xD7FDf2747A855AC20b96A5cEDeA84b2138cEd280')
  .addParam('source', 'address of the asset price feed (Chainlink WETH/USD: 0x9326BFA02ADD2366b30bacB125260Af641031331')
  .setAction(async ({ asset, source }, hre) => {
    // Erasing local.json file
    const configurationManagerAddress = await run('deployConfigurationManager')

    // 2) Deploy Option Builders + Option Factory
    await run('deployOptionFactory', { builders: true, configuration: configurationManagerAddress })

    // 3) Deploy BS + Sigma + AMMPoolFactory + Oracles
    await run('setAMMEnvironment', { asset: asset, source: source, configuration: configurationManagerAddress })
  })
