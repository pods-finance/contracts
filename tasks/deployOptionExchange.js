
internalTask('deployOptionExchange', 'Deploy new option exchange using provider')
  .addParam('factory', 'Address of the factory to pass to initialize')
  .setAction(async ({ factory }, bre) => {
    console.log('----Start Deploy OptionExchange----')
    const OptionExchangeContract = await ethers.getContractFactory('OptionExchange')
    const optionExchange = await OptionExchangeContract.deploy(factory)
    console.log('Option Exchange Address: ', optionExchange.address)
    return optionExchange.address
  })
