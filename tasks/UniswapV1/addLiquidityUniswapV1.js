const UniswapExchangeABI = require('../../abi/uniswap_exchange.json')

internalTask('addLiquidityUniswapV1', 'addLiquidityUniswapV1')
  .addOptionalParam('optionContractName', 'Option Contract type to use')
  .addParam('token', 'Token Address to add liquidity')
  .addParam('amountOfTokens', 'Max amount of Tokens')
  .addParam('amountOfEth', 'Amount of Eth')
  .addParam('deployerAddress', 'Sender address')
  .addParam('factory', 'UniswapV1 factory address')
  .setAction(async ({ token, amountOfEth, amountOfTokens, deployerAddress, factory }) => {
    const tokenContract = await ethers.getContractAt('MockERC20', token)
    // Get Exchange Address
    const tokenExchangeAddress = await run('getExchangeUniswapV1', { token, factory })
    const ExchangeContract = new web3.eth.Contract(UniswapExchangeABI, tokenExchangeAddress)
    // Approve tokens to be added
    const txIdApprove = await tokenContract.approve(tokenExchangeAddress, (ethers.constants.MaxUint256).toString())
    await txIdApprove.wait()
    // Add liquidity per se
    await ExchangeContract.methods.addLiquidity(0, amountOfTokens, (ethers.constants.MaxUint256).toString()).send({ from: deployerAddress, value: amountOfEth })
    console.log('Liquidity Added')
  })
