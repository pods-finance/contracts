internalTask('addLiquidityAMM', 'addLiquidityAMM')
  .addParam('tokena', 'Token Address to add liquidity')
  .addParam('tokenb', 'Token Address to add liquidity')
  .addParam('amounta', 'Max amount of Tokens')
  .addParam('amountb', 'Amount of Eth')
  .addParam('pooladdress', 'poolAddress')
  .setAction(async ({ tokena, tokenb, amounta, amountb, pooladdress }) => {
    const TokenContractA = await ethers.getContractAt('MockERC20', tokena)
    const TokenContractB = await ethers.getContractAt('MockERC20', tokenb)
    const PoolContract = await ethers.getContractAt('OptionAMMPool', pooladdress)
    // Get Exchange Address
    // Approve tokens to be added
    await TokenContractA.approve(pooladdress, (ethers.constants.MaxUint256).toString())
    await TokenContractB.approve(pooladdress, (ethers.constants.MaxUint256).toString())
    // Add liquidity per se
    const a = ethers.BigNumber.from(1)
    const b = ethers.BigNumber.from(1)
    await PoolContract.addLiquidity(a, b)
    console.log('Liquidity Added: amountA: ' + amounta + ' and amountB: ' + amountb)
  })
