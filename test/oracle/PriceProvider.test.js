const { expect } = require('chai')
const createPriceFeedMock = require('../util/createPriceFeedMock')
const createConfigurationManager = require('../util/createConfigurationManager')
const getTimestamp = require('../util/getTimestamp')

describe('PriceProvider', () => {
  let PriceProvider, provider, deployer
  let defaultPriceFeed, startedAt, updatedAt

  const decimals = ethers.BigNumber.from(6)
  const price = ethers.BigNumber.from(450e6)
  const asset0 = '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF'
  const asset1 = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
  let configurationManager

  before(async () => {
    PriceProvider = await ethers.getContractFactory('PriceProvider')
    configurationManager = await createConfigurationManager()
    startedAt = await getTimestamp()
    updatedAt = startedAt + 1
    ;[deployer] = await ethers.getSigners()
    defaultPriceFeed = await createPriceFeedMock(deployer)
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

    const parameterName = ethers.utils.formatBytes32String('MIN_UPDATE_INTERVAL')

    await configurationManager.setParameter(parameterName, ethers.BigNumber.from(11100))

    provider = await PriceProvider.deploy(configurationManager.address, [asset0], [defaultPriceFeed.contract.address])
    await configurationManager.setPriceProvider(provider.address)
  })

  describe('PriceFeed management', () => {
    it('assigns the asset on construction correctly', async () => {
      expect(await provider.getPriceFeed(asset0)).to.equal(defaultPriceFeed.contract.address)
    })
    it('assigns the decimals on construction correctly', async () => {
      expect(await provider.getAssetDecimals(asset0)).to.equal(decimals)
    })
    it('should revert if minUpdateInterval is invalid during deploy', async () => {
      const parameterName = ethers.utils.formatBytes32String('MIN_UPDATE_INTERVAL')
      const parameterValue = ethers.BigNumber.from(2).pow(255)
      await configurationManager.setParameter(parameterName, parameterValue)
      await expect(PriceProvider.deploy(configurationManager.address, [asset0], [defaultPriceFeed.contract.address])).to.be.revertedWith('PriceProvider: Invalid minUpdateInterval')
      await configurationManager.setParameter(parameterName, '11100')
    })
    it('should update the minUpdateInterval correctly from configuratorManager', async () => {
      const parameterName = ethers.utils.formatBytes32String('MIN_UPDATE_INTERVAL')
      const parameterValue = ethers.BigNumber.from(15)
      await configurationManager.setParameter(parameterName, parameterValue)

      await provider.updateMinUpdateInterval()
      expect(await provider.minUpdateInterval()).to.be.equal(parameterValue)

      await configurationManager.setParameter(parameterName, ethers.BigNumber.from(11100))
    })

    it('should not update the minUpdateInterval if invalid value came from configuratorManager', async () => {
      const parameterName = ethers.utils.formatBytes32String('MIN_UPDATE_INTERVAL')
      const parameterValue = ethers.BigNumber.from(2).pow(255)
      await configurationManager.setParameter(parameterName, parameterValue)

      await expect(provider.updateMinUpdateInterval()).to.be.revertedWith('PriceProvider: Invalid minUpdateInterval')

      await configurationManager.setParameter(parameterName, ethers.BigNumber.from(11100))
    })
  })

  describe('setAssetFeeds', () => {
    it('should set a new feed', async () => {
      const newPriceFeed = await createPriceFeedMock(deployer)
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
      const notStartedPriceFeed = await createPriceFeedMock(deployer)
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
      const stalePriceFeed = await createPriceFeedMock(deployer)
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
      const newPriceFeed = await createPriceFeedMock(deployer)
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
      const stalePriceFeed = await createPriceFeedMock(deployer)
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
