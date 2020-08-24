
const BFactoryABI = require('../../abi/BFactory.json')

internalTask('createExchangeBalancer', 'Deploy a new Balancer Pool')
  .setAction(async ({}, bre) => {
    console.log('Create new Balancer Pool')
    const [owner] = await ethers.getSigners()
    const deployerAddress = await owner.getAddress()
    let poolAddress

    const { balancerFactory } = require(`../../deployments/${bre.network.name}.json`)
    const BalancerFactoryContract = await ethers.getContractAt(BFactoryABI, balancerFactory)
    const creationTx = await BalancerFactoryContract.newBPool()

    const filterFrom = await BalancerFactoryContract.filters.LOG_NEW_POOL(deployerAddress)
    const eventDetails = await BalancerFactoryContract.queryFilter(filterFrom, creationTx.blockNumber, creationTx.blockNumber)
    console.log('txId: ', creationTx.hash)
    console.log('timestamp: ', new Date())
    await creationTx.wait()
    if (eventDetails.length) {
      const { caller, pool } = eventDetails[0].args
      console.log('blockNumber: ', eventDetails[0].blockNumber)
      console.log('deployer: ', caller)
      console.log('pool: ', pool)
      poolAddress = pool
    } else {
      console.log('Something went wrong: No events found')
      throw 'Something went wrong: No events found'
    }
    return poolAddress
  })
