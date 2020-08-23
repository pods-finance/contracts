
internalTask('deployOptionExchange', 'Deploy new option exchange using provider')
  .addParam('provider', 'String representing provider name (E.g: UniswapV1Provider)')
  .addParam('factory', 'String of the factory name to pass to initialize')
  .setAction(async ({ provider, factory }, bre) => {
    const factoryAddress = require(`../deployments/${bre.network.name}.json`)[factory]
    const ExchangeProvider = await ethers.getContractFactory(provider)
    // 1) Deploy provider
    const exchangeProvider = await ExchangeProvider.deploy()
    // 2) Initialize Provider
    await exchangeProvider.initialize(factoryAddress)
    // 3) Deploy Option Exchange
    const ExchangeContract = await ethers.getContractFactory('OptionExchange')
    const optionExchange = await ExchangeContract.deploy(exchangeProvider.address)
    console.log('Option Exchange Address: ', optionExchange.address)
  })
