task('getPool', "Prints a option's pool address")
  .addPositionalParam('option', "The option's address")
  .addOptionalPositionalParam('factory', 'optional Pool factory address (default: pick from /deployments')
  .setAction(async ({ option, factory }, hre) => {
    let factoryAddress
    if (!factory) {
      factoryAddress = require(`../../deployments/${hre.network.name}.json`).optionAMMFactory
    } else {
      factoryAddress = factory
    }
    
    const factoryContract = await ethers.getContractAt('OptionAMMFactory', factoryAddress)
    const poolAddress = await factoryContract.getPool(option)
    console.log('poolAddress: ', poolAddress)
    return poolAddress
  })
