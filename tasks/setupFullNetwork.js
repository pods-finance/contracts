task('setupFullNetwork', 'Deploy a whole local Kovan environment')
  .addParam('asset', 'name of the asset (e.g: WETH, DAI)')
  .addParam('source', 'address of the asset price feed (Chainlink WETH/USD: 0x9326BFA02ADD2366b30bacB125260Af641031331')
  .addFlag('verify', 'bool if the contract should be verified or not')
  .setAction(async ({ asset, source, verify, wethadapt }, hre) => {
    await hre.run('compile')
    const contracts = require(`../deployments/${hre.network.name}.json`)

    const assetUpper = asset.toUpperCase()
    const assetAddress = contracts[assetUpper]
    // Erasing local.json file
    const configurationManagerAddress = await run('deployConfigurationManager', { verify })
    const configurationManager = await ethers.getContractAt('ConfigurationManager', configurationManagerAddress)
    const priceProvider = await ethers.getContractAt('PriceProvider', await configurationManager.getPriceProvider())
    const chainlinkFeed = await hre.run('deployChainlink', {
      source
    })
    await priceProvider.setAssetFeeds([asset], [chainlinkFeed])

    await hre.run('setAMMEnvironment', {
      asset: assetAddress,
      source: source,
      configuration: configurationManagerAddress,
      builders: true,
      verify
    })
  })
