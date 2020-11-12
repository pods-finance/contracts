
internalTask('deployOptionExchange', 'Deploy new option exchange using provider')
  .addParam('provider', 'String representing provider name (E.g: UniswapV1Provider)')
  .addParam('factory', 'Address of the factory to pass to initialize')
  .setAction(async ({ provider, factory }, bre) => {
    console.log(`----Start Deploy ${provider}----`)
    const ExchangeProvider = await ethers.getContractFactory(provider)
    // 1) Deploy provider
    const exchangeProvider = await ExchangeProvider.deploy(factory)
     console.log('Option Provider Address: ', exchangeProvider.address)
    // 2) Deploy Option Exchange
    console.log('----Start Deploy OptionExchange----')
    const ExchangeContract = await ethers.getContractFactory('OptionExchange')
    const optionExchange = await ExchangeContract.deploy(exchangeProvider.address)
    console.log('Option Exchange Address: ', optionExchange.address)
    return optionExchange.address
  })
