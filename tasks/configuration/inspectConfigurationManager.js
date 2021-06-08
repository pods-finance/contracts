const { getDeployments } = require('../utils/deployment')
const validateAddress = require('../utils/validateAddress')

task('inspectConfigurationManager', 'Checks the contracts associated with a ConfigurationManager instance')
  .addOptionalPositionalParam('address', 'An address of a deployed ConfigurationManager, defaults to current `deployments` json file')
  .setAction(async ({ address }, hre) => {
    if (!address) {
      const deployment = getDeployments()
      address = deployment.ConfigurationManager
    }

    validateAddress(address, 'address')

    const configurationManager = await ethers.getContractAt('ConfigurationManager', address)

    console.log(`ConfigurationManager deployed at: ${configurationManager.address}`)
    console.log(`EmergencyStop: ${await configurationManager.getEmergencyStop()}`)
    console.log(`BlackScholes: ${await configurationManager.getPricingMethod()}`)
    console.log(`IVGuesser: ${await configurationManager.getIVGuesser()}`)
    console.log(`IVProvider: ${await configurationManager.getIVProvider()}`)
    console.log(`PriceProvider: ${await configurationManager.getPriceProvider()}`)
    console.log(`CapProvider: ${await configurationManager.getCapProvider()}`)
    console.log(`OptionFactory: ${await configurationManager.getOptionFactory()}`)
    console.log(`OptionAMMFactory: ${await configurationManager.getAMMFactory()}`)
    console.log(`OptionHelper: ${await configurationManager.getOptionHelper()}`)
  })
