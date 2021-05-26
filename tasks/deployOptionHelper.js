const { getDeployments } = require('./utils/deployment')
const validateAddress = require('./utils/validateAddress')

task('deployOptionHelper', 'Deploy new option helper using provider')
  .addOptionalParam('configuration', 'An address of a deployed ConfigurationManager, defaults to current `deployments` json file')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .setAction(async ({ configuration, verify }, hre) => {
    if (!configuration) {
      const deployment = getDeployments()
      configuration = deployment.ConfigurationManager
    }

    validateAddress(configuration, 'configuration')

    const address = await hre.run('deploy', {
      name: 'OptionHelper',
      args: [configuration],
      verify,
      save: true
    })

    return address
  })
