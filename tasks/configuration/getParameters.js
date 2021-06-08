const { getDeployments } = require('../utils/deployment')
const validateAddress = require('../utils/validateAddress')

task('getParameter', 'Get a ConfigurationManager parameter')
  .addPositionalParam('parameter', 'Parameter name')
  .addOptionalParam('configuration', 'An address of a deployed ConfigurationManager, defaults to current `deployments` json file')
  .setAction(async ({ configuration, parameter }, hre) => {
    if (!configuration) {
      const deployment = getDeployments()
      configuration = deployment.ConfigurationManager
    }

    validateAddress(configuration, 'configuration')

    const configurationManager = await ethers.getContractAt('ConfigurationManager', configuration)

    const parameterName = ethers.utils.formatBytes32String(parameter)
    const currentValue = (await configurationManager.getParameter(parameterName)).toString()

    console.log(`Getting ConfigurationManager(${configurationManager.address})\nParameter: ${parameter}\nValue: ${currentValue}`)

    return currentValue
  })
