const { getDeployments } = require('../utils/deployment')
const validateAddress = require('../utils/validateAddress')

task('deployIVGuesser', 'Deploy IV Contract')
  .addOptionalParam('bs', 'Black Scholes Address')
  .addOptionalParam('configuration', 'An address of a deployed ConfigurationManager, defaults to current `deployments` json file')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .setAction(async ({ bs, configuration, verify }, hre) => {
    if (!configuration) {
      const deployment = getDeployments()
      configuration = deployment.ConfigurationManager
    }

    validateAddress(configuration, 'configuration')

    if (!bs) {
      const configurationManager = await ethers.getContractAt('ConfigurationManager', configuration)
      bs = await configurationManager.getPricingMethod()
    }

    const address = await hre.run('deploy', {
      name: 'IVGuesser',
      args: [configuration, bs],
      verify,
      save: true
    })

    return address
  })
