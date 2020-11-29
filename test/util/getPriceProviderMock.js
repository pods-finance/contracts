const { deployMockContract } = waffle
const PriceFeedABI = require('../../abi/PriceFeed.json')
const getTimestamp = require('./getTimestamp')

module.exports = async function getPriceFeedMock (deployer, refPrice, refDecimals, tokenAddress) {
  const PriceProvider = await ethers.getContractFactory('PriceProvider')
  const priceFeed = await deployMockContract(deployer, PriceFeedABI)
  const roundData = {
    roundId: 1,
    answer: refPrice,
    startedAt: await getTimestamp(),
    updatedAt: await getTimestamp() + 1,
    answeredInRound: 1,
  }

  await priceFeed.mock.latestRoundData.returns(
    roundData.roundId,
    roundData.answer,
    roundData.startedAt,
    roundData.updatedAt,
    roundData.answeredInRound
  )

  await priceFeed.mock.getLatestPrice
    .returns(refPrice)

  await priceFeed.mock.decimals
    .returns(refDecimals)

  const priceProvider = await PriceProvider.deploy([tokenAddress], [priceFeed.address])
  await priceProvider.deployed()

  return {
    priceProvider
  }
}
