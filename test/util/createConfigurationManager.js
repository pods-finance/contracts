const { ethers } = require('hardhat')
const createBlackScholes = require('./createBlackScholes')

module.exports = async function createConfigurationManager ({ priceProvider } = {}) {
  const [PriceProvider, ConfigurationManager, EmergencyStop, CapProvider, IVGuesser, blackScholes] = await Promise.all([
    ethers.getContractFactory('PriceProvider'),
    ethers.getContractFactory('ConfigurationManager'),
    ethers.getContractFactory('EmergencyStop'),
    ethers.getContractFactory('CapProvider'),
    ethers.getContractFactory('IVGuesser'),
    createBlackScholes()
  ])

  const [configurationManager, emergencyStop, cap] = await Promise.all([
    ConfigurationManager.deploy(),
    EmergencyStop.deploy(),
    CapProvider.deploy()
  ])

  const ivGuesser = await IVGuesser.deploy(configurationManager.address, blackScholes.address)

  if (!priceProvider) {
    priceProvider = await PriceProvider.deploy(configurationManager.address, [], [])
  }

  await configurationManager.setPricingMethod(blackScholes.address)
  await configurationManager.setPriceProvider(priceProvider.address)
  await configurationManager.setIVGuesser(ivGuesser.address)
  await configurationManager.setEmergencyStop(emergencyStop.address)
  await configurationManager.setCapProvider(cap.address)

  return configurationManager
}
