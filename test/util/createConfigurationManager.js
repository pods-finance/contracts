const { ethers } = require('@nomiclabs/buidler')
const deployBlackScholes = require('./deployBlackScholes')

module.exports = async function createConfigurationManager () {
  const [ConfigurationManager, EmergencyStop, blackScholes] = await Promise.all([
    ethers.getContractFactory('ConfigurationManager'),
    ethers.getContractFactory('EmergencyStop'),
    deployBlackScholes()
  ])

  const [configurationManager, emergencyStop] = await Promise.all([
    ConfigurationManager.deploy(),
    EmergencyStop.deploy()
  ])

  await configurationManager.setPricingMethod(blackScholes.address)
  await configurationManager.setEmergencyStop(emergencyStop.address)

  return configurationManager
}
