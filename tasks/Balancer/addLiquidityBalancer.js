
const BigNumber = require('bignumber.js')
const BPoolABI = require('../../abi/BPool.json')
const erc20ABI = require('../../abi/erc20.json')

internalTask('addLiquidityBalancer', 'Add Liquidity to a specific balancer pool')
  .addParam('pool', 'Balancer pool address')
  .addParam('token', 'Token address to add liquidity')
  .addParam('weight', 'Token weight to add liquidity')
  .addParam('balance', 'balance without counting decimals (Eg: 73)')
  .setAction(async ({ pool, token, weight, balance }, bre) => {
    console.log('Add Liqudity to Balancer Pool')
    const BPoolContract = await ethers.getContractAt(BPoolABI, pool)
    const tokenContract = await ethers.getContractAt(erc20ABI, token)
    const tokenDecimals = await tokenContract.decimals()
    const balanceToLock = new BigNumber(balance).multipliedBy(10 ** tokenDecimals).toString()
    const denormWeight = new BigNumber(weight).dividedBy(2).multipliedBy(1e18).toString()

    // 1) Approve pool to add token
    await tokenContract.approve(pool, (ethers.constants.MaxUint256).toString())

    // 2) Bind Token
    await BPoolContract.bind(token, balanceToLock, denormWeight)

    const currentTokens = await BPoolContract.getCurrentTokens()
    console.log('currentTokens', currentTokens)
  })
