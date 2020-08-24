
task('deployFactory', 'Deploy OptionFactory or aOptionFactory')
  .addFlag('aave', 'is it a interest bearing option')
  .setAction(async ({ aave }, bre) => {
    const wethAddress = require(`../deployments/${bre.network.name}.json`).WETH

    const contractName = aave ? 'aOptionFactory' : 'OptionFactory'
    const OptionFactory = await ethers.getContractFactory(contractName)
    const factory = await OptionFactory.deploy(wethAddress)

    await factory.deployed()

    console.log(`${contractName} deployed to:`, factory.address)
  })
