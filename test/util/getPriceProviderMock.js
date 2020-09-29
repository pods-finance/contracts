const { deployMockContract } = waffle
const PriceFeedABI = require('../../abi/PriceFeed.json')

module.exports = async function getPriceFeedMock (deployer, refPrice, tokenAddress) {
  const priceFeed = await deployMockContract(deployer, PriceFeedABI)
  const PriceProvider = await ethers.getContractFactory('PriceProvider')

  const priceProvider = await PriceProvider.deploy([tokenAddress], [priceFeed.address])
  await priceProvider.deployed()

  await priceFeed.mock.getLatestPrice
    .returns(refPrice)

  return {
    priceProvider
  }
}
