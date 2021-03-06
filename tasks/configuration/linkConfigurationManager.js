const { getDeployments } = require('../utils/deployment')
const validateAddress = require('../utils/validateAddress')

task('linkConfigurationManager', 'Link a contract with a ConfigurationManager')
  .addOptionalParam('address', 'An address of a deployed ConfigurationManager, defaults to current `deployments` json file')
  .addPositionalParam('setter', 'The setter to interact with')
  .addPositionalParam('newContract', 'The new contract address to set')
  .setAction(async ({ address, setter, newContract }, bre) => {
    if (!address) {
      const deployment = getDeployments()
      address = deployment.ConfigurationManager
    }

    validateAddress(address, 'address')
    validateAddress(newContract, 'newContract')

    const configurationManager = await ethers.getContractAt('ConfigurationManager', address)

    let transaction

    switch (setter) {
      case 'setEmergencyStop':
        transaction = await configurationManager.setEmergencyStop(newContract)
        await transaction.wait(1)
        console.log(`EmergencyStop set to ${newContract}`)
        break
      case 'setPricingMethod':
        transaction = await configurationManager.setPricingMethod(newContract)
        await transaction.wait(1)
        console.log(`PricingMethod set to ${newContract}`)
        break
      case 'setImpliedVolatility':
        transaction = await configurationManager.setIVGuesser(newContract)
        await transaction.wait(1)
        console.log(`ImpliedVolatility set to ${newContract}`)
        break
      case 'setPriceProvider':
        transaction = await configurationManager.setPriceProvider(newContract)
        await transaction.wait(1)
        console.log(`PriceProvider set to ${newContract}`)
        break
      case 'setIVProvider':
        transaction = await configurationManager.setIVProvider(newContract)
        await transaction.wait(1)
        console.log(`IVProvider set to ${newContract}`)
        break
      case 'setCapProvider':
        transaction = await configurationManager.setCapProvider(newContract)
        await transaction.wait(1)
        console.log(`CapProvider set to ${newContract}`)
        break
      case 'setAMMFactory':
        transaction = await configurationManager.setAMMFactory(newContract)
        await transaction.wait(1)
        console.log(`AMMFactory set to ${newContract}`)
        break
      case 'setOptionFactory':
        transaction = await configurationManager.setOptionFactory(newContract)
        await transaction.wait(1)
        console.log(`OptionFactory set to ${newContract}`)
        break
      case 'setOptionHelper':
        transaction = await configurationManager.setOptionHelper(newContract)
        await transaction.wait(1)
        console.log(`OptionHelper set to ${newContract}`)
        break
      default:
        throw new Error('Setter not found! Available setters: setEmergencyStop, setPricingMethod, setImpliedVolatility, setPriceProvider, setCapProvider')
    }
  })
