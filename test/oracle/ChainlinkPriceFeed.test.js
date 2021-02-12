const { expect } = require('chai')
const { deployMockContract } = waffle
const IChainlinkPriceFeedABI = require('../../abi/IChainlinkPriceFeed.json')
const getTimestamp = require('../util/getTimestamp')

describe('ChainlinkPriceFeed', () => {
  let ChainlinkPriceFeed, feed
  let startedAt, updatedAt

  const decimals = ethers.BigNumber.from(6)
  const price = ethers.BigNumber.from(450e6)

  before(async () => {
    ChainlinkPriceFeed = await ethers.getContractFactory('ChainlinkPriceFeed')
    startedAt = await getTimestamp()
    updatedAt = startedAt + 1
  })

  beforeEach(async () => {
    const roundData = {
      roundId: 1,
      answer: price,
      startedAt,
      updatedAt,
      answeredInRound: 1
    }

    const [deployer] = await ethers.getSigners()
    const mockChainlink = await deployMockContract(deployer, IChainlinkPriceFeedABI)

    await mockChainlink.mock.decimals.returns(decimals)
    await mockChainlink.mock.latestRoundData.returns(
      roundData.roundId,
      roundData.answer,
      roundData.startedAt,
      roundData.updatedAt,
      roundData.answeredInRound
    )

    feed = await ChainlinkPriceFeed.deploy(mockChainlink.address)
  })

  it('cannot be deployed with a zero-address source', async () => {
    const tx = ChainlinkPriceFeed.deploy(ethers.constants.AddressZero)
    await expect(tx).to.be.revertedWith('ChainlinkPriceFeed: Invalid source')
  })

  it('returns the correct decimals', async () => {
    expect(await feed.decimals()).to.equal(decimals)
  })

  it('returns the correct price', async () => {
    const priceObj = await feed.getLatestPrice()
    expect(priceObj[0]).to.equal(price)
  })

  it('returns the correct round data', async () => {
    const round = await feed.latestRoundData()
    expect(round.answer).to.equal(price)
    expect(round.startedAt.toNumber()).to.be.lessThan(await getTimestamp())
  })
})
