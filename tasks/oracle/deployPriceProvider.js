internalTask('deployPriceProvider', 'Deploy PriceProvider Contract')
  .addOptionalParam('asset', 'address of asset')
  .addOptionalParam('feed', 'address of priceFeed asset')
  .setAction(async ({ asset, feed }) => {
    console.log('----Start Deploy PriceProvider----')
    let assetArray = []
    let feedArray = []

    if (asset && feed) {
      assetArray = [asset]
      feedArray = [feed]
    }

    const PriceProvider = await ethers.getContractFactory('PriceProvider')
    const priceProvider = await PriceProvider.deploy(assetArray, feedArray)

    await priceProvider.deployed(2)
    console.log('PriceProvider Address', priceProvider.address)
    return priceProvider.address
  })
