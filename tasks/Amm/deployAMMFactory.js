internalTask('deployOptionAMMFactory', 'Deploy deployOptionAMMFactory Contract')
  .addParam('priceFeed', 'address of priceFeed')
  .addParam('priceMethod', 'address of priceMethod')
  .addParam('sigma', 'address of sigma')
  .setAction(async ({ priceFeed, priceMethod, sigma }) => {
    console.log('----Start Deploy OptionAMMFactory----')
    const OptionAMMFactory = await ethers.getContractFactory('OptionAMMFactory')
    const optionAMMFactory = await OptionAMMFactory.deploy(priceFeed, priceMethod, sigma)

    await optionAMMFactory.deployed()
    console.log('OptionAMMFactory Address', optionAMMFactory.address)
    return optionAMMFactory.address
  })
