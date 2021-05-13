task('getParameter', 'Get a ConfigurationManager parameter')
  .addPositionalParam('parameter', 'Parameter name')
  .addOptionalParam('configurator', 'An address of a deployed ConfigurationManager, defaults to current `deployments` json file')
  .setAction(async ({ configurator, parameter }, bre) => {
    const filePath = `../../deployments/${bre.network.name}.json`

    if (!configurator) {
      const json = require(filePath)
      configurator = json.configurationManager
    }

    if (!ethers.utils.isAddress(configurator)) {
      throw new Error(`\`configurator\` is not an address. Received: ${configurator}`)
    }

    const configurationManager = await ethers.getContractAt('ConfigurationManager', configurator)

    const parameterName = ethers.utils.formatBytes32String(parameter)
    const currentValue = (await configurationManager.getParameter(parameterName)).toString()

    console.log(`Getting ConfigurationManager(${configurationManager.address})\nParameter: ${parameter}\nValue: ${currentValue}`)

    return currentValue
  })
