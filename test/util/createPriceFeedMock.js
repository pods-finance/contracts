const { deployMockContract } = waffle
const PriceFeedABI = require('../../abi/ChainlinkPriceFeed.json')
const getTimestamp = require('./getTimestamp')

module.exports = async function createPriceFeedMock (deployer) {
  let _roundData

  const mockChainlink = await deployMockContract(deployer, PriceFeedABI)

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

  const setUpdateAt = timestamp => {
    _roundData.updatedAt = timestamp
    return setRoundData(_roundData)
  }

  return {
    contract: mockChainlink,
    setDecimals: decimals => {
      return mockChainlink.mock.decimals.returns(decimals)
    },
    setRoundData,
    setPrice,
    setUpdateAt
  }
}
