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
    const configurationManagerAddress = configuration || JSON.parse(content).ConfigurationManager
    let assetArray = []
    let feedArray = []

    if (asset && feed) {
      assetArray = [asset]
      feedArray = [feed]
    }

    // const configurationManager = await ethers.getContractAt('ConfigurationManager', configurationManagerAddress)
    // const parameterName = ethers.utils.formatBytes32String('MIN_UPDATE_INTERVAL')

    // const tx = await configurationManager.setParameter(parameterName, '17280000')
    // tx.wait(2)

    if (!configurationManagerAddress) {
      throw Error('Configuration Manager not found')
    }

    const PriceProvider = await ethers.getContractFactory('PriceProvider')
    const priceProvider = await PriceProvider.deploy(configurationManagerAddress, assetArray, feedArray)

    await priceProvider.deployed(2)
    console.log('PriceProvider Address', priceProvider.address)
    return priceProvider.address
  })
