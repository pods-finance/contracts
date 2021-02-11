const getTimestamp = require('./getTimestamp')
const createPriceFeedMock = require('./createPriceFeedMock')

module.exports = async function getPriceProviderMock (deployer, refPrice, refDecimals, tokenAddress) {
  const PriceProvider = await ethers.getContractFactory('PriceProvider')
  const priceFeed = await createPriceFeedMock(deployer)
  await priceFeed.setDecimals(refDecimals)
  await priceFeed.setRoundData({
    roundId: 1,
    answer: refPrice,
    startedAt: await getTimestamp(),
    updatedAt: await getTimestamp() + 1,
    answeredInRound: 1
  })

  const priceProvider = await PriceProvider.deploy([tokenAddress], [priceFeed.contract.address])
  await priceProvider.deployed()

  return {
    priceProvider,
    priceFeed
  }
}
