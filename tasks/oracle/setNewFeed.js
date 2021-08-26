const { getDeployments } = require('../utils/deployment')

task('setNewFeed', 'Deploy Chainlink w/ source + set source and asset to price provider')
  .addParam('asset', 'name of the asset (e.g: WETH / WBTC / DAI)')
  .addParam('source', 'address of the asset price feed (Chainlink WETH/USD: ')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .setAction(async ({ source, asset, verify }, hre) => {
    console.log('----Start Deploying new Chainlink Price Feed and Adding to PriceProvider----')
    const numberOfConfirmations = hre.network.name === 'local' ? 1 : 2

    const deployments = getDeployments()
    const assetAddress = deployments[asset.toUpperCase()]

    const chainlinkFeedAddress = await hre.run('deployChainlink', { source, verify })
    console.log('Setting feed to Price Provider')

    const configurationManager = await ethers.getContractAt('ConfigurationManager', deployments.ConfigurationManager)
    const priceProvider = await ethers.getContractAt('PriceProvider', await configurationManager.getPriceProvider())
    const tx = await priceProvider.setAssetFeeds([assetAddress], [chainlinkFeedAddress])
    await tx.wait(numberOfConfirmations)

    console.log('----End of Setting new Feed----')
  })
