const { ethers } = require('hardhat')
const { expect } = require('chai')

describe('ConfigurationManager', () => {
  let ConfigurationManager, configurationManager

  beforeEach(async () => {
    ConfigurationManager = await ethers.getContractFactory('ConfigurationManager')
    configurationManager = await ConfigurationManager.deploy()
  })

  it('sets all modules and get the address correctly', async () => {
    const randomAddress = '0x0000000000000000000000000000000000000001'

    await configurationManager.setEmergencyStop(randomAddress)
    await configurationManager.setPricingMethod(randomAddress)
    await configurationManager.setSigmaGuesser(randomAddress)
    await configurationManager.setPriceProvider(randomAddress)
    await configurationManager.setCapProvider(randomAddress)
    await configurationManager.setAMMFactory(randomAddress)
    await configurationManager.setOptionFactory(randomAddress)
    await configurationManager.setOptionHelper(randomAddress)

    expect(await configurationManager.getEmergencyStop())
      .to.equal(randomAddress)

    expect(await configurationManager.getPricingMethod())
      .to.equal(randomAddress)

    expect(await configurationManager.getSigmaGuesser())
      .to.equal(randomAddress)

    expect(await configurationManager.getPriceProvider())
      .to.equal(randomAddress)

    expect(await configurationManager.getCapProvider())
      .to.equal(randomAddress)

    expect(await configurationManager.getAMMFactory())
      .to.equal(randomAddress)

    expect(await configurationManager.getOptionFactory())
      .to.equal(randomAddress)

    expect(await configurationManager.getOptionHelper())
      .to.equal(randomAddress)
  })

  it('can set and get parameters', async () => {
    const parameterName = ethers.utils.formatBytes32String('CUSTOM_PARAMETER')
    const parameterValue = ethers.BigNumber.from(42)

    const tx = configurationManager.setParameter(parameterName, parameterValue)
    await expect(tx).to.emit(configurationManager, 'ParameterSet')
      .withArgs(parameterName, 42)

    expect(await configurationManager.getParameter(parameterName)).to.be.equal(parameterValue)
  })

  it('sets parameters by default', async () => {
    const parameterName = ethers.utils.formatBytes32String('MIN_UPDATE_INTERVAL')
    expect(await configurationManager.getParameter(parameterName)).to.be.equal(11100)
  })
})
