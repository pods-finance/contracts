const saveJSON = require('./utils/saveJSON')
const verifyContract = require('./utils/verify')

task('deployOptionExchange', 'Deploy new option exchange using provider')
  .addParam('factory', 'Address of the factory to pass to initialize')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .setAction(async ({ factory, verify }, hre) => {
    console.log('----Start Deploy OptionExchange----')
    const path = `../../deployments/${hre.network.name}.json`
    const OptionExchangeContract = await ethers.getContractFactory('OptionExchange')
    const optionExchange = await OptionExchangeContract.deploy(factory)
    console.log('Option Exchange Address: ', optionExchange.address)

    await saveJSON(path, { optionExchange: optionExchange.address })

    if (verify) {
      await verifyContract(hre, optionExchange.address, [factory])
    }

    return optionExchange.address
  })
