const { getDeployments } = require('../utils/deployment')
const validateAddress = require('../utils/validateAddress')

task('deployPriceProvider', 'Deploy PriceProvider Contract')
  .addOptionalParam('asset', 'address of asset')
  .addOptionalParam('feed', 'address of priceFeed asset')
  .addOptionalParam('configuration', 'An address of a deployed ConfigurationManager, defaults to current `deployments` json file')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .addFlag('save', 'if true, it should save the contract address inside the deployments folder')
  .setAction(async ({ asset, feed, configuration, verify, save }, hre) => {
    if (!configuration) {
      const deployment = getDeployments()
      configuration = deployment.ConfigurationManager
    }

    validateAddress(configuration, 'configuration')

    let assets = []
    let feeds = []

    if (asset && feed) {
      assets = [asset]
      feeds = [feed]
    }

    const address = await hre.run('deploy', {
      name: 'PriceProvider',
      args: [configuration, assets, feeds],
      verify,
      save
    })

    return address
  })
