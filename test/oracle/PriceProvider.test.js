const { expect } = require('chai')
const { deployMockContract } = waffle
const PriceFeed = require('../../abi/PriceFeed.json')
const getTimestamp = require('../util/getTimestamp')

describe('PriceProvider', () => {
  let PriceProvider, provider
  let defaultPriceFeed, startedAt, updatedAt

  const decimals = ethers.BigNumber.from(6)
  const price = ethers.BigNumber.from(450e6)
  const asset0 = '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF'
  const asset1 = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

  before(async () => {
    PriceProvider = await ethers.getContractFactory('PriceProvider')
    startedAt = await getTimestamp()
    updatedAt = startedAt + 1

    defaultPriceFeed = await createPriceFeedMock(price, decimals, startedAt, updatedAt)
  })

  beforeEach(async () => {
    provider = await PriceProvider.deploy([asset0], [defaultPriceFeed.address])
  })

  describe('PriceFeed management', () => {
    it('assigns the asset on construction correctly', async () => {
      expect(await provider.getPriceFeed(asset0)).to.equal(defaultPriceFeed.address)
    })

    it('assigns the decimals on construction correctly', async () => {
      expect(await provider.getAssetDecimals(asset0)).to.equal(decimals)
    })

    it('should set a new feed', async () => {
      const newPriceFeed = await createPriceFeedMock(50e6, 6, startedAt, updatedAt)
      const tx = provider.setAssetFeeds([asset1], [newPriceFeed.address])

      await expect(tx)
        .to.emit(provider, 'AssetFeedUpdated')
        .withArgs(asset1, newPriceFeed.address)

      expect(await provider.getPriceFeed(asset1)).to.equal(newPriceFeed.address)
    })

    it('should remove a feed', async () => {
      const newPriceFeed = await createPriceFeedMock(50e6, 6, startedAt, updatedAt)
      await provider.setAssetFeeds([asset1], [newPriceFeed.address])
      const tx = provider.removeAssetFeeds([asset1])

      await expect(tx)
        .to.emit(provider, 'AssetFeedRemoved')
        .withArgs(asset1, newPriceFeed.address)

      expect(await provider.getPriceFeed(asset1)).to.equal(ethers.constants.AddressZero)
    })
  })

  it('fetches the price', async () => {
    expect(await provider.getAssetPrice(asset0)).to.be.equal(price)
  })

  it('fetches the round data', async () => {
    expect(await provider.latestRoundData(asset0)).to.be.deep.equal([
      ethers.BigNumber.from(1),
      price,
      ethers.BigNumber.from(startedAt),
      ethers.BigNumber.from(updatedAt),
      ethers.BigNumber.from(1)
    ])
  })
})

async function createPriceFeedMock (price, decimals, startedAt, updatedAt) {
  const roundData = {
    roundId: 1,
    answer: price,
    startedAt,
    updatedAt,
    answeredInRound: 1
  }

  const [deployer] = await ethers.getSigners()
  const mockChainlink = await deployMockContract(deployer, PriceFeed)
  await mockChainlink.mock.decimals.returns(decimals)
  await mockChainlink.mock.getLatestPrice.returns(roundData.answer)
  await mockChainlink.mock.latestRoundData.returns(
    roundData.roundId,
    roundData.answer,
    roundData.startedAt,
    roundData.updatedAt,
    roundData.answeredInRound
  )

  return mockChainlink
}
