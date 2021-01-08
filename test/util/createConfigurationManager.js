const { ethers } = require('@nomiclabs/buidler')

module.exports = async function createConfigurationManager () {
  const ConfigurationManager = await ethers.getContractFactory('ConfigurationManager')
  const EmergencyStop = await ethers.getContractFactory('EmergencyStop')

  const configurationManager = await ConfigurationManager.deploy()
  const emergencyStop = await EmergencyStop.deploy()

  await configurationManager.setEmergencyStop(emergencyStop.address)

  return configurationManager
}
