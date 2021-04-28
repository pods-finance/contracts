task('setupFullNetwork', 'Deploy a whole local Kovan environment')
  .addParam('asset', 'address of initial asset of the feed (WETH: 0xD7FDf2747A855AC20b96A5cEDeA84b2138cEd280')
  .addParam('source', 'address of the asset price feed (Chainlink WETH/USD: 0x9326BFA02ADD2366b30bacB125260Af641031331')
  .addOptionalParam('wethadapt', 'adapt weth if using other network (e.g: WMATIC address in matic network)')
  .addFlag('verify', 'bool if the contract should be verified or not')
  .setAction(async ({ asset, source, verify, wethadapt }, hre) => {
    await hre.run('compile')
    // Erasing local.json file
    const configurationManagerAddress = await run('deployConfigurationManager', { verify })

    await run('setAMMEnvironment', { asset: asset, source: source, configuration: configurationManagerAddress, builders: true, wethadapt, verify })
  })
