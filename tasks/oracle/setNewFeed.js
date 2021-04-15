const saveJSON = require('../utils/saveJSON')

const fs = require('fs')
const pathJoin = require('path')
const fsPromises = fs.promises

task('setNewFeed', 'Deploy Chainlink w/ source + set source and asset to price provider')
  .addParam('asset', 'name of the asset (e.g: WETH / WBTC / DAI)')
  .addParam('source', 'address of the asset price feed (Chainlink WETH/USD: ')
  .setAction(async ({ source, asset }, hre) => {
    console.log('----Start Deploying new Chainlink Price Feed and Adding to PriceProvider----')
    const path = `../../deployments/${hre.network.name}.json`
    const numberOfConfirmations = hre.network.name === 'local' ? 1 : 2

    const assetUpper = asset.toUpperCase()

    const _filePath = pathJoin.join(__dirname, path)
    const content = await fsPromises.readFile(_filePath)
    const contentJSON = JSON.parse(content)

    const assetAddress = contentJSON[assetUpper]
    const priceProviderAddress = contentJSON.priceProvider

    const chainlinkFeedAddress = await run('deployChainlink', { source })
    console.log('Setting feed to Price Provider')

    const priceProvider = await ethers.getContractAt('PriceProvider', priceProviderAddress)
    const tx = await priceProvider.setAssetFeeds([assetAddress], [chainlinkFeedAddress])
    await tx.wait(numberOfConfirmations)

    console.log('----End of Setting new Feed----')
  })
