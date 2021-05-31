const { getDeployments } = require('../utils/deployment')
const validateAddress = require('../utils/validateAddress')

task('deployOracle', 'Deploy full Oracle (Chainlink + PriceFeed)')
  .addParam('asset', 'address of initial asset of the feed (WETH: 0xD7FDf2747A855AC20b96A5cEDeA84b2138cEd280')
  .addParam('source', 'address of the asset price feed (Chainlink WETH/USD: ')
  .addOptionalParam('configuration', 'An address of a deployed ConfigurationManager, defaults to current `deployments` json file')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .setAction(async ({ source, asset, configuration, verify }, hre) => {
    if (!configuration) {
      const deployment = getDeployments()
      configuration = deployment.ConfigurationManager
    }

    validateAddress(configuration, 'configuration')

    const chainlinkAddress = await hre.run('deployChainlink', {
      source,
      verify
    })

    const priceProviderAddress = await hre.run('deployPriceProvider', {
      configuration,
      asset,
      feed: chainlinkAddress,
      save: true,
      verify
    })

    return priceProviderAddress
  })
