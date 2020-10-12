internalTask('deployPriceProvider', 'Deploy PriceProvider Contract')
  .addParam('asset', 'address of asset')
  .addParam('feed', 'address of priceFeed asset')
  .setAction(async ({ asset, feed }) => {
    console.log('----Start Deploy PriceProvider----')
    const PriceProvider = await ethers.getContractFactory('PriceProvider')
    const priceProvider = await PriceProvider.deploy([asset], [feed])

    await priceProvider.deployed()
    console.log('PriceProvider Address', priceProvider.address)
    return priceProvider.address
  })
