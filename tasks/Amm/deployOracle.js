internalTask('deployOracle', 'Deploy full Oracle (Chainlink + PriceFeed)')
  .addParam('asset', 'address of initial asset of the feed')
  .addParam('source', 'address of the asset pricefeed')
  .setAction(async ({ source, asset }) => {
    console.log('----Start Deploy Oracle----')
    const chainlinkAddress = await run('deployChainlink', { source })
    const priceProviderAddress = await run('deployPriceProvider', { asset, feed: chainlinkAddress })

    console.log('----End Deploy Oracle----')
  })
