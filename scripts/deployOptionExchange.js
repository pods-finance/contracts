const bre = require('@nomiclabs/buidler')

async function main () {
  // await bre.run('compile');
  const uniswapFactoryAddress = require(`../deployments/${bre.network.name}.json`).uniswapFactory
  const [ExchangeUniswapV1Provider, OptionExchange] = await Promise.all([
    ethers.getContractFactory('UniswapV1Provider'),
    ethers.getContractFactory('OptionExchange')
  ])

  const exchangeUniswapV1Provider = await ExchangeUniswapV1Provider.deploy()
  await exchangeUniswapV1Provider.deployed()

  await exchangeUniswapV1Provider.initialize(uniswapFactoryAddress)

  const optionExchange = await OptionExchange.deploy(exchangeUniswapV1Provider.address)
  await optionExchange.deployed()

  console.log('OptionExchange deployed to:', optionExchange.address)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
