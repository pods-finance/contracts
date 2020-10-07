
internalTask('deployChainlink', 'Deploy Chainlink Contract')
  .addParam('source', 'address of chainlink pricefeed')
  .setAction(async ({ source }) => {
    console.log('----Start Deploy Chainlink----')
    const Chainlink = await ethers.getContractFactory('ChainlinkPriceFeed')
    const chainlink = await Chainlink.deploy(source)

    await chainlink.deployed()
    console.log('Chainlink', chainlink.address)
    return chainlink.address
  })
