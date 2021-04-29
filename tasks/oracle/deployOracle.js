const saveJSON = require('../utils/saveJSON')
const verifyContract = require('../utils/verify')

task('deployOracle', 'Deploy full Oracle (Chainlink + PriceFeed)')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .addParam('asset', 'address of initial asset of the feed (WETH: 0xD7FDf2747A855AC20b96A5cEDeA84b2138cEd280')
  .addParam('source', 'address of the asset price feed (Chainlink WETH/USD: ')
  .addParam('configuration', 'address of the configurtion manager')
  .setAction(async ({ source, asset, configuration, verify }, hre) => {
    console.log('----Start Deploy Oracle----')
    const path = `../../deployments/${hre.network.name}.json`
    const chainlinkAddress = await run('deployChainlink', { source })
    const priceProviderAddress = await run('deployPriceProvider', { configuration, asset, feed: chainlinkAddress })

    await saveJSON(path, { chainlinkPriceFeed: chainlinkAddress, priceProvider: priceProviderAddress })

    if (verify) {
      await verifyContract(hre, chainlinkAddress, [source])
      await verifyContract(hre, priceProviderAddress, [configuration, [asset], [chainlinkAddress]])
    }

    console.log('----End Deploy Oracle----')
    return priceProviderAddress
  })
