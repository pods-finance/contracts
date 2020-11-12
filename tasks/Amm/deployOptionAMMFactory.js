const saveJSON = require('../utils/saveJSON')

internalTask('deployOptionAMMFactory', 'Deploy deployOptionAMMFactory Contract')
  .setAction(async ({}, bre) => {
    const path = `../../deployments/${bre.network.name}.json`
    console.log('----Start Deploy OptionAMMFactory----')
    const OptionAMMFactory = await ethers.getContractFactory('OptionAMMFactory')
    const optionAMMFactory = await OptionAMMFactory.deploy()

    await optionAMMFactory.deployed()
    console.log('OptionAMMFactory Address', optionAMMFactory.address)

    await saveJSON(path, { optionAMMFactory: optionAMMFactory.address })
    return optionAMMFactory.address
  })
