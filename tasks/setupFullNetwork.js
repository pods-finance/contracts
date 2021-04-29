task('setupFullNetwork', 'Deploy a whole local Kovan environment')
  .addParam('asset', 'name of the asset (e.g: WETH, DAI)')
  .addParam('source', 'address of the asset price feed (Chainlink WETH/USD: 0x9326BFA02ADD2366b30bacB125260Af641031331')
  .addOptionalParam('wethadapt', 'adapt weth if using other network (e.g: WMATIC address in matic network)')
  .addFlag('verify', 'bool if the contract should be verified or not')
  .setAction(async ({ asset, source, verify, wethadapt }, hre) => {
    await hre.run('compile')
    const cnotracts = require(`../deployments/${hre.network.name}.json`)

    const assetUpper = asset.toUpperCase()
    const assetAddress = cnotracts[assetUpper]
    // Erasing local.json file
    const configurationManagerAddress = await run('deployConfigurationManager', { verify })

    await run('setAMMEnvironment', { asset: assetAddress, source: source, configuration: configurationManagerAddress, builders: true, wethadapt, verify })
  })
