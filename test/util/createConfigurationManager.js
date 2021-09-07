const { ethers } = require('hardhat')
const createBlackScholes = require('./createBlackScholes')

module.exports = async function createConfigurationManager ({ optionAMMFactory, priceProvider, ivProvider, optionPoolRegistry, networkToken, deployer } = {}) {
  if (!deployer) {
    [deployer] = await ethers.getSigners()
  }

  const [
    ConfigurationManager, EmergencyStop, CapProvider, IVGuesser,
    blackScholes, MockNetworkToken
  ] = await Promise.all([
    ethers.getContractFactory('ConfigurationManager'),
    ethers.getContractFactory('EmergencyStop'),
    ethers.getContractFactory('CapProvider'),
    ethers.getContractFactory('IVGuesser'),
    createBlackScholes(),
    ethers.getContractFactory('WETH')
  ])

  const [configurationManager, emergencyStop, cap, mockNetworkToken] = await Promise.all([
    ConfigurationManager.deploy(),
    EmergencyStop.deploy(),
    CapProvider.deploy(),
    MockNetworkToken.deploy()
  ])

  const ivGuesser = await IVGuesser.deploy(configurationManager.address, blackScholes.address)

  if (!priceProvider) {
    const PriceProvider = await ethers.getContractFactory('PriceProvider')
    priceProvider = await PriceProvider.deploy(configurationManager.address, [], [])
  }

  if (!optionAMMFactory) {
    const OptionAMMFactory = await ethers.getContractFactory('OptionAMMFactory')
    const FeePoolBuilder = await ethers.getContractFactory('FeePoolBuilder')
    const feePoolBuilder = await FeePoolBuilder.deploy()
    optionAMMFactory = await OptionAMMFactory.deploy(configurationManager.address, feePoolBuilder.address)
  }

  if (!optionPoolRegistry) {
    const OptionPoolRegistry = await ethers.getContractFactory('OptionPoolRegistry')
    optionPoolRegistry = await OptionPoolRegistry.deploy(configurationManager.address)
  }

  if (!ivProvider) {
    const IVProvider = await ethers.getContractFactory('IVProvider')
    ivProvider = await IVProvider.deploy()
    await ivProvider.setUpdater(deployer.address)
  }

  // Set Network Token
  const parameterName = ethers.utils.formatBytes32String('WRAPPED_NETWORK_TOKEN')
  const parameterValue = networkToken || mockNetworkToken.address
  await configurationManager.setParameter(parameterName, parameterValue)

  await configurationManager.setPricingMethod(blackScholes.address)
  await configurationManager.setPriceProvider(priceProvider.address)
  await configurationManager.setIVGuesser(ivGuesser.address)
  await configurationManager.setIVProvider(ivProvider.address)
  await configurationManager.setEmergencyStop(emergencyStop.address)
  await configurationManager.setCapProvider(cap.address)
  await configurationManager.setOptionPoolRegistry(optionPoolRegistry.address)
  await configurationManager.setAMMFactory(optionAMMFactory.address)

  return configurationManager
}
