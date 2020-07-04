const bre = require('@nomiclabs/buidler')
const UniswapExchangeBytecode = require('../bytecode/uniswap_exchange')
const UniswapFactoryBytecode = require('../bytecode/uniswap_factory')
const UniswapFactoryABI = require('../abi/uniswap_factory.json')
const UniswapExchangeABI = require('../abi/uniswap_exchange.json')

async function main () {
  const [owner] = await ethers.getSigners()

  // 1) Creating Uniswap Factory
  const uniswapFactoryContract = new ethers.ContractFactory(UniswapFactoryABI, UniswapFactoryBytecode, owner)
  const uniswapFactory = await uniswapFactoryContract.deploy()
  await uniswapFactory.deployTransaction.wait()
  console.log('UNISWAP_FACTORY: ', uniswapFactory.address)

  // 2) Deploying Uniswap Exchange that will be used as template
  const uniswapExchangeContract = new ethers.ContractFactory(UniswapExchangeABI, UniswapExchangeBytecode, owner)
  const uniswapExchange = await uniswapExchangeContract.deploy()
  await uniswapExchange.deployTransaction.wait()
  console.log('UNISWAP_EXCHANGE_TEMPLATE: ', uniswapExchange.address)

  // 3) Initialize Uniswap Factory
  await uniswapFactory.initializeFactory(uniswapExchange.address)
  console.log('Initialization Done')
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
