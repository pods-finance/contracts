const fs = require('fs')
const pathJoin = require('path')
const fsPromises = fs.promises

task('deployPriceProvider', 'Deploy PriceProvider Contract')
  .addOptionalParam('asset', 'address of asset')
  .addOptionalParam('feed', 'address of priceFeed asset')
  .addOptionalParam('configuration', 'An address of a deployed ConfigurationManager, defaults to current `deployments` json file')
  .setAction(async ({ asset, feed, configuration }) => {
    console.log('----Start Deploy PriceProvider----')
    const path = `../../deployments/${hre.network.name}.json`
    const _filePath = pathJoin.join(__dirname, path)
    const content = await fsPromises.readFile(_filePath)
    const configurationManager = configuration || JSON.parse(content).configurationManager
    let assetArray = []
    let feedArray = []

    if (asset && feed) {
      assetArray = [asset]
      feedArray = [feed]
    }

    if (!configurationManager) {
      throw Error('Configuration Manager not found')
    }

    const PriceProvider = await ethers.getContractFactory('PriceProvider')
    const priceProvider = await PriceProvider.deploy(configurationManager, assetArray, feedArray)

    await priceProvider.deployed(2)
    console.log('PriceProvider Address', priceProvider.address)
    return priceProvider.address
  })
