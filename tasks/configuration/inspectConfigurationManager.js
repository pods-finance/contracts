task('inspectConfigurationManager', 'Checks the contracts associated with a ConfigurationManager instance')
  .addOptionalPositionalParam('address', 'An address of a deployed ConfigurationManager, defaults to current `deployments` json file')
  .setAction(async ({ address }, bre) => {
    const filePath = `../../deployments/${bre.network.name}.json`

    if (!address) {
      const json = require(filePath)
      address = json.configurationManager
    }

    if (!ethers.utils.isAddress(address)) {
      throw new Error(`\`address\` is not an address. Received: ${address}`)
    }

    const configurationManager = await ethers.getContractAt('ConfigurationManager', address)

    console.log(`ConfigurationManager deployed at: ${configurationManager.address}`)
    console.log(`EmergencyStop: ${await configurationManager.getEmergencyStop()}`)
    console.log(`BlackScholes: ${await configurationManager.getPricingMethod()}`)
    console.log(`SigmaGuesser: ${await configurationManager.getSigmaGuesser()}`)
    console.log(`PriceProvider: ${await configurationManager.getPriceProvider()}`)
    console.log(`CapProvider: ${await configurationManager.getCapProvider()}`)
    console.log(`OptionFactory: ${await configurationManager.getOptionFactory()}`)
    console.log(`OptionAMMFactory: ${await configurationManager.getAMMFactory()}`)
    console.log(`OptionHelper: ${await configurationManager.getOptionHelper()}`)
  })
