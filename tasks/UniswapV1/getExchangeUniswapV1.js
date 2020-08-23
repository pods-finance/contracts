
const UniswapFactoryABI = require('../../abi/uniswap_factory.json')

internalTask('getExchangeUniswapV1', 'Get a Uniswap V1 Exchange')
  .addParam('token', 'Token to get the exchange')
  .addParam('factory', 'Uniswap V1 factory addresss')
  .setAction(async ({ token, factory: factoryAddress }) => {
    // console.log('Get Uniswap Exchange Address')
    const UniswapFactoryContract = new web3.eth.Contract(UniswapFactoryABI, factoryAddress)

    try {
      const exchangeAddress = await UniswapFactoryContract.methods.getExchange(token).call()
      console.log('ExchangeAddress: ', exchangeAddress)
      return exchangeAddress
    } catch (err) {
      throw 'Uniswap exchange not found'
    }
  })
