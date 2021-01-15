const { ethers } = require('@nomiclabs/buidler')
const deployBlackScholes = require('./deployBlackScholes')

module.exports = async function createConfigurationManager () {
  const [ConfigurationManager, EmergencyStop, Sigma, blackScholes] = await Promise.all([
    ethers.getContractFactory('ConfigurationManager'),
    ethers.getContractFactory('EmergencyStop'),
    ethers.getContractFactory('Sigma'),
    deployBlackScholes()
  ])

  const [configurationManager, emergencyStop, sigma] = await Promise.all([
    ConfigurationManager.deploy(),
    EmergencyStop.deploy(),
    Sigma.deploy(blackScholes.address)
  ])

  await configurationManager.setPricingMethod(blackScholes.address)
  await configurationManager.setImpliedVolatility(sigma.address)
  await configurationManager.setEmergencyStop(emergencyStop.address)

  return configurationManager
}
