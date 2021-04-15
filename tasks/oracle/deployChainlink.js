task('deployChainlink', 'Deploy Chainlink Contract')
  .addParam('source', 'address of chainlink pricefeed')
  .setAction(async ({ source }) => {
    const numberOfConfirmations = hre.network.name === 'local' ? 1 : 2

    console.log('----Start Deploy Chainlink----')
    const Chainlink = await ethers.getContractFactory('ChainlinkPriceFeed')
    const chainlink = await Chainlink.deploy(source)
    await chainlink.deployTransaction.wait(numberOfConfirmations)

    console.log('Chainlink', chainlink.address)
    return chainlink.address
  })
