
const UniswapFactoryABI = require('../../abi/uniswap_factory.json')
const UniswapExchangeABI = require('../../abi/uniswap_exchange.json')

internalTask('createExchangeUniswapV1', 'Deploy a new Uniswap V1 Exchange')
  .addParam('token', 'Token to create the exchange')
  .addParam('factoryAddress', 'Uniswap V1 factory')
  .addParam('deployerAddress', 'Address of the deployer')
  .setAction(async ({ token, factoryAddress, deployerAddress }) => {
    console.log('Create New Uniswap Exchange')
    const UniswapFactoryContract = new web3.eth.Contract(UniswapFactoryABI, factoryAddress)
    await UniswapFactoryContract.methods.createExchange(token).send({ from: deployerAddress })
    const tokenExchangeAddress = await UniswapFactoryContract.methods.getExchange(token).call()
    console.log('tokenExchangeAddress: ', tokenExchangeAddress)
    return tokenExchangeAddress
  })
