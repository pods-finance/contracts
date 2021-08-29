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

    console.log(`ConfigurationManager is deployed at: ${configurationManager.address}\nOwned by: ${await configurationManager.owner()}`)
    console.table({
      EmergencyStop: await configurationManager.getEmergencyStop(),
      BlackScholes: await configurationManager.getPricingMethod(),
      IVGuesser: await configurationManager.getIVGuesser(),
      IVProvider: await configurationManager.getIVProvider(),
      PriceProvider: await configurationManager.getPriceProvider(),
      CapProvider: await configurationManager.getCapProvider(),
      OptionFactory: await configurationManager.getOptionFactory(),
      OptionAMMFactory: await configurationManager.getAMMFactory(),
      OptionHelper: await configurationManager.getOptionHelper(),
      OptionPoolRegistry: await configurationManager.getOptionPoolRegistry()
    })
  })
