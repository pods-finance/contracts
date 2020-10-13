internalTask('deployOptionAMMFactory', 'Deploy deployOptionAMMFactory Contract')
  .setAction(async () => {
    console.log('----Start Deploy OptionAMMFactory----')
    const OptionAMMFactory = await ethers.getContractFactory('OptionAMMFactory')
    const optionAMMFactory = await OptionAMMFactory.deploy()

    await optionAMMFactory.deployed()
    console.log('OptionAMMFactory Address', optionAMMFactory.address)
    return optionAMMFactory.address
  })
