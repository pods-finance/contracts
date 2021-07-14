const { getDeployments } = require('../utils/deployment')
const validateAddress = require('../utils/validateAddress')

task('deployOptionAMMFactory', 'Deploy deployOptionAMMFactory Contract')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .addOptionalParam('configuration', 'An address of a deployed ConfigurationManager, defaults to current `deployments` json file')
  .addOptionalParam('feebuilder', 'An address of a deployed FeePoolBuilder, defaults to current `deployments` json file')
  .setAction(async ({ configuration, feebuilder, verify }, hre) => {
    const deployment = getDeployments()

    if (!configuration) {
      configuration = deployment.ConfigurationManager
    }

    if (!feebuilder) {
      feebuilder = deployment.FeePoolBuilder
    }

    validateAddress(configuration, 'configuration')
    validateAddress(feebuilder, 'feebuilder')

    const address = await hre.run('deploy', {
      name: 'OptionAMMFactory',
      args: [configuration, feebuilder],
      verify,
      save: true
    })

    return address
  })
