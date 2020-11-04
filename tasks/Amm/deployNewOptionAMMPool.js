
task('deployNewOptionAMMPool', 'Deploy a New AMM Pool')
  .addParam('option', 'Option address')
  .addParam('tokenb', 'What is the other token that will be in the pool')
  .addParam('initialsigma', 'Initial Sigma to start the pool')
  .setAction(async ({ option, tokenb, initialsigma }, bre) => {
    const [owner] = await ethers.getSigners()
    const deployerAddress = await owner.getAddress()

    // 1) Create Option
    const { optionAMMFactory, sigma, blackScholes, priceProvider } = require(`../../deployments/${bre.network.name}.json`)

    const OptionAMMFactory = await ethers.getContractAt('OptionAMMFactory', optionAMMFactory)

    const txIdNewPool = await OptionAMMFactory.createPool(option, tokenb, priceProvider, blackScholes, sigma, initialsigma)
    await txIdNewPool.wait()

    console.log('txId: ', txIdNewPool.hash)

    const filterFrom = await OptionAMMFactory.filters.PoolCreated(deployerAddress)
    const eventDetails = await OptionAMMFactory.queryFilter(filterFrom, txIdNewPool.blockNumber, txIdNewPool.blockNumber)
    if (eventDetails.length) {
      const { deployer, pool: poolAddress } = eventDetails[0].args
      console.log('blockNumber: ', eventDetails[0].blockNumber)
      console.log('deployer: ', deployer)
      console.log('pool: ', poolAddress)
      return poolAddress
    } else {
      console.log('Something went wrong: No events found')
    }
  })
