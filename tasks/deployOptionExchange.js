
internalTask('deployOptionExchange', 'Deploy new option exchange using provider')
  .addParam('provider', 'String representing provider name (E.g: UniswapV1Provider)')
  .addParam('factory', 'String of the factory name to pass to initialize')
  .setAction(async ({ provider, factory }, bre) => {
    const factoryAddress = require(`../deployments/${bre.network.name}.json`)[factory]
    console.log(`----Start Deploy ${provider}----`)
    const ExchangeProvider = await ethers.getContractFactory(provider)
    // 1) Deploy provider
    const exchangeProvider = await ExchangeProvider.deploy(factoryAddress)
     console.log('Option Provider Address: ', exchangeProvider.address)
    // 2) Deploy Option Exchange
    console.log('----Start Deploy OptionExchange----')
    const ExchangeContract = await ethers.getContractFactory('OptionExchange')
    const optionExchange = await ExchangeContract.deploy(exchangeProvider.address)
    console.log('Option Exchange Address: ', optionExchange.address)
    return optionExchange.address
  })
