task('setupKovan', 'Deploy a whole local Kovan environment')
  .addParam('asset', 'address of initial asset of the feed (WETH: 0xD7FDf2747A855AC20b96A5cEDeA84b2138cEd280')
  .addParam('source', 'address of the asset price feed (Chainlink WETH/USD: 0x9326BFA02ADD2366b30bacB125260Af641031331')
  .addFlag('verify', 'bool if the contract should be verified or not')
  .setAction(async ({ asset, source, verify }, hre) => {
    // Erasing local.json file
    const configurationManagerAddress = await run('deployConfigurationManager', { verify })

    // 2) Deploy Option Builders + Option Factory
    await run('deployOptionFactory', { builders: true, configuration: configurationManagerAddress, verify })

    // 3) Deploy BS + Sigma + AMMPoolFactory + Oracles
    await run('setAMMEnvironment', { asset: asset, source: source, configuration: configurationManagerAddress, verify })
  })
