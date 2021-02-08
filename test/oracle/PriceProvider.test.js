const { expect } = require('chai')
const { deployMockContract } = waffle
const PriceFeed = require('../../abi/ChainlinkPriceFeed.json')
const getTimestamp = require('../util/getTimestamp')

describe.only('PriceProvider', () => {
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

    defaultPriceFeed = await createPriceFeedMock()
  })

  beforeEach(async () => {
    await defaultPriceFeed.setDecimals(decimals)
    await defaultPriceFeed.setRoundData({
      roundId: 1,
      answer: price,
      startedAt,
      updatedAt,
      answeredInRound: 1
    })
    provider = await PriceProvider.deploy([asset0], [defaultPriceFeed.contract.address])
  })

  describe('PriceFeed management', () => {
    it('assigns the asset on construction correctly', async () => {
      expect(await provider.getPriceFeed(asset0)).to.equal(defaultPriceFeed.contract.address)
    })

    it('assigns the decimals on construction correctly', async () => {
      expect(await provider.getAssetDecimals(asset0)).to.equal(decimals)
    })
  })

  describe('setAssetFeeds', () => {
    it('should set a new feed', async () => {
      const newPriceFeed = await createPriceFeedMock()
      await newPriceFeed.setDecimals(6)
      await newPriceFeed.setRoundData({
        roundId: 1,
        answer: 50e6,
        startedAt,
        updatedAt,
        answeredInRound: 1
      })
      const tx = provider.setAssetFeeds([asset1], [newPriceFeed.contract.address])

      await expect(tx)
        .to.emit(provider, 'AssetFeedUpdated')
        .withArgs(asset1, newPriceFeed.contract.address)

      expect(await provider.getPriceFeed(asset1)).to.equal(newPriceFeed.contract.address)
    })

    it('should revert if assets and feeds are with different lengths', async () => {
      await expect(provider.setAssetFeeds([asset1], [])).to.be.revertedWith('PriceProvider: inconsistent params length')
    })

    it('should revert if create with invalid PriceFeed', async () => {
      await expect(provider.setAssetFeeds([asset1], [ethers.constants.AddressZero])).to.be.revertedWith('PriceProvider: invalid PriceFeed')
    })

    it('should revert if Price Feed not started', async () => {
      const notStartedPriceFeed = await createPriceFeedMock()
      await notStartedPriceFeed.setDecimals(6)
      await notStartedPriceFeed.setRoundData({
        roundId: 1,
        answer: 50e6,
        startedAt: 0,
        updatedAt,
        answeredInRound: 1
      })
      await expect(provider.setAssetFeeds([asset1], [notStartedPriceFeed.contract.address])).to.be.revertedWith('PriceProvider: PriceFeed not started')
    })

    it('should revert if stale price feed', async () => {
      const stalePriceFeed = await createPriceFeedMock()
      const currentTimestamp = await getTimestamp()
      await stalePriceFeed.setDecimals(6)
      await stalePriceFeed.setRoundData({
        roundId: 1,
        answer: 50e6,
        startedAt,
        updatedAt: currentTimestamp - 11101,
        answeredInRound: 1
      })
      await expect(provider.setAssetFeeds([asset1], [stalePriceFeed.contract.address])).to.be.revertedWith('PriceProvider: stale PriceFeed')
    })
  })

  describe('removeAssetFeeds', () => {
    it('should remove a feed', async () => {
      const newPriceFeed = await createPriceFeedMock()
      await newPriceFeed.setDecimals(6)
      await newPriceFeed.setRoundData({
        roundId: 1,
        answer: 50e6,
        startedAt,
        updatedAt,
        answeredInRound: 1
      })
      await provider.setAssetFeeds([asset1], [newPriceFeed.contract.address])
      const tx = provider.removeAssetFeeds([asset1])

      await expect(tx)
        .to.emit(provider, 'AssetFeedRemoved')
        .withArgs(asset1, newPriceFeed.contract.address)

      expect(await provider.getPriceFeed(asset1)).to.equal(ethers.constants.AddressZero)
    })

    it('should revert if try to remove a nonexistent feed', async () => {
      await expect(provider.removeAssetFeeds([asset1]))
    })
  })

  describe('getAssetPrice', () => {
    it('should fetches the price correctly', async () => {
      expect(await provider.getAssetPrice(asset0)).to.be.equal(price)
    })

    it('should revert if stale price', async () => {
      const stalePriceFeed = await createPriceFeedMock()
      const currentTimestamp = await getTimestamp()
      await stalePriceFeed.setDecimals(6)
      await stalePriceFeed.setRoundData({
        roundId: 1,
        answer: 50e6,
        startedAt,
        updatedAt: currentTimestamp,
        answeredInRound: 1
      })
      await expect(provider.setAssetFeeds([asset1], [stalePriceFeed.contract.address])).to.not.be.reverted
      await stalePriceFeed.setRoundData({
        roundId: 1,
        answer: 50e6,
        startedAt,
        updatedAt: currentTimestamp - 11101,
        answeredInRound: 1
      })
      await expect(provider.getAssetPrice(asset1)).to.be.revertedWith('PriceProvider: stale PriceFeed')
    })

    it('should revert if fetches the price of nonexistent asset', async () => {
      await expect(provider.getAssetPrice(asset1)).to.be.revertedWith('PriceProvider: Feed not registered')
    })

    it('should revert if fetches the asset decimals of nonexistent asset', async () => {
      await expect(provider.getAssetDecimals(asset1)).to.be.revertedWith('PriceProvider: Feed not registered')
    })

    it('should revert when the price is negative', async () => {
      await defaultPriceFeed.setPrice(ethers.BigNumber.from(-450e6))
      await expect(provider.getAssetPrice(asset0)).to.be.revertedWith('PriceProvider: Negative price')
    })
  })

  describe('latestRoundData', () => {
    it('fetches the round data', async () => {
      const result = await provider.latestRoundData(asset0)

      expect(result.roundId).to.be.equal(ethers.BigNumber.from(1))
      expect(result.answer).to.be.equal(price)
      expect(result.startedAt).to.be.equal(ethers.BigNumber.from(startedAt))
      expect(result.updatedAt).to.be.equal(ethers.BigNumber.from(updatedAt))
      expect(result.answeredInRound).to.be.equal(ethers.BigNumber.from(1))
    })
    it('should revert if fetches unregistered Feed', async () => {
      await expect(provider.latestRoundData(asset1)).to.be.revertedWith('PriceProvider: Feed not registered')
    })
  })
})

async function createPriceFeedMock () {
  let _roundData

  const [deployer] = await ethers.getSigners()
  const mockChainlink = await deployMockContract(deployer, PriceFeed)

  const setRoundData = async roundData => {
    _roundData = roundData
    await mockChainlink.mock.getLatestPrice.returns(roundData.answer, roundData.updatedAt)
    await mockChainlink.mock.latestRoundData.returns(
      roundData.roundId,
      roundData.answer,
      roundData.startedAt,
      roundData.updatedAt,
      roundData.answeredInRound
    )
  }

  const setPrice = price => {
    _roundData.answer = price
    return setRoundData(_roundData)
  }

  return {
    contract: mockChainlink,
    setDecimals: decimals => {
      return mockChainlink.mock.decimals.returns(decimals)
    },
    setRoundData,
    setPrice
  }
}
