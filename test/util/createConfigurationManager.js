const { ethers } = require('hardhat')
const createBlackScholes = require('./createBlackScholes')

module.exports = async function createConfigurationManager ({ priceProvider, ivProvider } = {}) {
  const [
    PriceProvider, ConfigurationManager, EmergencyStop, CapProvider, IVGuesser, IVProvider, blackScholes
  ] = await Promise.all([
    ethers.getContractFactory('PriceProvider'),
    ethers.getContractFactory('ConfigurationManager'),
    ethers.getContractFactory('EmergencyStop'),
    ethers.getContractFactory('CapProvider'),
    ethers.getContractFactory('IVGuesser'),
    ethers.getContractFactory('IVProvider'),
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

  if (!ivProvider) {
    ivProvider = await IVProvider.deploy()
  }

  await configurationManager.setPricingMethod(blackScholes.address)
  await configurationManager.setPriceProvider(priceProvider.address)
  await configurationManager.setIVGuesser(ivGuesser.address)
  await configurationManager.setIVProvider(ivProvider.address)
  await configurationManager.setEmergencyStop(emergencyStop.address)
  await configurationManager.setCapProvider(cap.address)

  return configurationManager
}
