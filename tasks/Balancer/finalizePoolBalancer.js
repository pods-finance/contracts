
const BPoolABI = require('../../abi/BPool.json')

internalTask('finalizePoolBalancer', 'Finalize Balancer Pool')
  .addParam('pool', 'Balancer pool address')
  .setAction(async ({ pool, state }, bre) => {
    console.log('Finalize Balancer Pool')
    const BPoolContract = await ethers.getContractAt(BPoolABI, pool)
    await BPoolContract.finalize()

    const isFinalized = await BPoolContract.isFinalized()
    console.log('isFinalized: ', isFinalized)
  })
