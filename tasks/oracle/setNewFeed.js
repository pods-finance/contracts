const { getDeployments } = require('../utils/deployment')

task('setNewFeed', 'Deploy Chainlink w/ source + set source and asset to price provider')
  .addParam('asset', 'name of the asset (e.g: WETH / WBTC / DAI)')
  .addParam('source', 'address of the asset price feed (Chainlink WETH/USD: ')
  .setAction(async ({ source, asset }, hre) => {
    console.log('----Start Deploying new Chainlink Price Feed and Adding to PriceProvider----')
    const numberOfConfirmations = hre.network.name === 'local' ? 1 : 2

    const deployments = getDeployments()
    const assetUpper = asset.toUpperCase()

    const assetAddress = deployments[assetUpper]
    const priceProviderAddress = deployments.PriceProvider

    const chainlinkFeedAddress = await hre.run('deployChainlink', { source })
    console.log('Setting feed to Price Provider')

    const priceProvider = await ethers.getContractAt('PriceProvider', priceProviderAddress)
    const tx = await priceProvider.setAssetFeeds([assetAddress], [chainlinkFeedAddress])
    await tx.wait(numberOfConfirmations)

    console.log('----End of Setting new Feed----')
  })
