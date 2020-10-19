
task('deployNewOptionAMMPool', 'Deploy a New AMM Pool')
  .addParam('option', 'Option address')
  .addParam('tokenb', 'What is the other token that will be in the pool')
  .addParam('initialsigma', 'Initial Sigma to start the pool')
  .setAction(async ({ option, tokenb, initialsigma }, bre) => {
  // 1) Create Option
    const { optionAMMFactory, sigma, blackScholes, priceProvider } = require(`../../deployments/${bre.network.name}.json`)

    const OptionAMMFactory = await ethers.getContractAt('OptionAMMFactory', optionAMMFactory)

    const txIdNewPool = await OptionAMMFactory.createPool(option, tokenb, priceProvider, blackScholes, sigma, initialsigma)

    const [owner] = await ethers.getSigners()
    const deployerAddress = await owner.getAddress()

    const filterFrom = await OptionAMMFactory.filters.PoolCreated(deployerAddress)
    const eventDetails = await OptionAMMFactory.queryFilter(filterFrom, txIdNewPool.blockNumber, txIdNewPool.blockNumber)
    console.log('txId: ', txIdNewPool.hash)
    console.log('timestamp: ', new Date())
    await txIdNewPool.wait()
    if (eventDetails.length) {
      const { deployer, pool } = eventDetails[0].args
      console.log('blockNumber: ', eventDetails[0].blockNumber)
      console.log('deployer: ', deployer)
      console.log('pool: ', pool)
      const poolAddress = pool

      console.log('New Pool Address: ' + poolAddress)
      return poolAddress
    } else {
      console.log('Something went wrong: No events found')
    }
  })
