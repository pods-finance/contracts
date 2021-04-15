const getTimestamp = require('./getTimestamp')
const createPriceFeedMock = require('./createPriceFeedMock')

module.exports = async function getPriceProviderMock ({ deployer, price, decimals, tokenAddress, configurationManager } = {}) {
  const PriceProvider = await ethers.getContractFactory('PriceProvider')
  const priceFeed = await createPriceFeedMock(deployer)
  await priceFeed.setDecimals(decimals)
  await priceFeed.setRoundData({
    roundId: 1,
    answer: price,
    startedAt: await getTimestamp(),
    updatedAt: await getTimestamp() + 1,
    answeredInRound: 1
  })

  const priceProvider = await PriceProvider.deploy(configurationManager.address, [tokenAddress], [priceFeed.contract.address])
  await priceProvider.deployed()

  return {
    priceProvider,
    priceFeed
  }
}
