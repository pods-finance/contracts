
const BPoolABI = require('../../abi/BPool.json')

internalTask('setPublicSwapBalancer', 'Change BPool public swap state')
  .addParam('pool', 'Balancer pool address')
  .addParam('state', 'Pool pulic swap state (Eg: true/false)')
  .setAction(async ({ pool, state }, bre) => {
    console.log('Set Public Swap to Balancer Pool')
    const BPoolContract = await ethers.getContractAt(BPoolABI, pool)
    await BPoolContract.setPublicSwap(state)

    const isPublicSwap = await BPoolContract.isPublicSwap()
    console.log('isPublicSwap: ', isPublicSwap)
  })
