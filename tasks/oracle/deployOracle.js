const saveJSON = require('../utils/saveJSON')

internalTask('deployOracle', 'Deploy full Oracle (Chainlink + PriceFeed)')
  .addParam('asset', 'address of initial asset of the feed (WETH: 0xD7FDf2747A855AC20b96A5cEDeA84b2138cEd280')
  .addParam('source', 'address of the asset price feed (Chainlink WETH/USD: ')
  .setAction(async ({ source, asset }, bre) => {
    console.log('----Start Deploy Oracle----')
    const path = `../../deployments/${bre.network.name}.json`
    const chainlinkAddress = await run('deployChainlink', { source })
    const priceProviderAddress = await run('deployPriceProvider', { asset, feed: chainlinkAddress })

    await saveJSON(path, { chainlinkPriceFeed: chainlinkAddress, priceProvider: priceProviderAddress })

    console.log('----End Deploy Oracle----')
    return priceProviderAddress
  })
