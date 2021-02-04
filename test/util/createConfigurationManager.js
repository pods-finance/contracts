const { ethers } = require('hardhat')
const createBlackScholes = require('./createBlackScholes')

module.exports = async function createConfigurationManager (priceProvider) {
  const [PriceProvider, ConfigurationManager, EmergencyStop, CapProvider, Sigma, blackScholes] = await Promise.all([
    ethers.getContractFactory('PriceProvider'),
    ethers.getContractFactory('ConfigurationManager'),
    ethers.getContractFactory('EmergencyStop'),
    ethers.getContractFactory('CapProvider'),
    ethers.getContractFactory('Sigma'),
    createBlackScholes()
  ])

  const [configurationManager, emergencyStop, cap, sigma] = await Promise.all([
    ConfigurationManager.deploy(),
    EmergencyStop.deploy(),
    CapProvider.deploy(),
    Sigma.deploy(blackScholes.address)
  ])

  if (!priceProvider) {
    priceProvider = await PriceProvider.deploy([], [])
  }

  await configurationManager.setPricingMethod(blackScholes.address)
  await configurationManager.setPriceProvider(priceProvider.address)
  await configurationManager.setImpliedVolatility(sigma.address)
  await configurationManager.setEmergencyStop(emergencyStop.address)
  await configurationManager.setCapProvider(cap.address)

  return configurationManager
}
