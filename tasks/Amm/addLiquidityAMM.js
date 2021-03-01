const approveTransferERC20 = require('../utils/approveTransferERC20')

internalTask('addLiquidityAMM', 'addLiquidityAMM')
  .addParam('pooladdress', 'poolAddress')
  .addParam('amounta', 'Amount of tokens A')
  .addParam('amountb', 'Amount of tokens B')
  .addOptionalParam('owner', 'Liquidity owner')
  .setAction(async ({ amounta, amountb, pooladdress, owner }, hre) => {
    const [caller] = await ethers.getSigners()
    const callerAddress = await caller.getAddress()
    const numberOfConfirmations = hre.network.name === 'local' ? 1 : 2

    if (!owner) {
      owner = callerAddress
    }

    const pool = await ethers.getContractAt('OptionAMMPool', pooladdress)
    const tokenA = await ethers.getContractAt('MintableERC20', await pool.tokenA())
    const tokenB = await ethers.getContractAt('MintableERC20', await pool.tokenB())

    const amountA = ethers.BigNumber.from(amounta).mul(ethers.BigNumber.from(10).pow(await tokenA.decimals()))
    const amountB = ethers.BigNumber.from(amountb).mul(ethers.BigNumber.from(10).pow(await tokenB.decimals()))

    // Approve tokens to be added
    await approveTransferERC20(tokenA, pooladdress, amountA, numberOfConfirmations)

    await approveTransferERC20(tokenB, pooladdress, amountB, numberOfConfirmations)

    // Add liquidity per se
    await pool.addLiquidity(amountA, amountB, owner)
    console.log(`Liquidity added to pool: ${pooladdress}\nAmountA: ${amounta} ${await tokenA.symbol()}\nAmountB: ${amountb} ${await tokenB.symbol()}`)
  })
