const { expect } = require('chai')
const createConfigurationManager = require('../../util/createConfigurationManager')
const getTimestamp = require('../../util/getTimestamp')

const EXERCISE_TYPE_EUROPEAN = 0

describe('AavePodCallBuilder', function () {
  let OptionBuilder
  let optionBuilder, underlyingAsset, strikeAsset, configurationManager

  before(async () => {
    ;[OptionBuilder, MintableInterestBearing, configurationManager] = await Promise.all([
      ethers.getContractFactory('AavePodCallBuilder'),
      ethers.getContractFactory('MintableInterestBearing'),
      createConfigurationManager()
    ])
    ;[underlyingAsset, strikeAsset, optionBuilder] = await Promise.all([
      MintableInterestBearing.deploy('WETH', 'WETH', 18),
      MintableInterestBearing.deploy('aDAI', 'aDAI', 18),
      OptionBuilder.deploy()
    ])
  })

  it('Should create a new AavePodCall Option correctly and not revert', async function () {
    const optionData = {
      name: 'Pods Call WETH:aDAI 1200 2021-06-11',
      symbol: 'PodWETH:aDAI',
      strikePrice: ethers.BigNumber.from(300e18.toString()),
      expiration: await getTimestamp() + 24 * 60 * 60 * 7,
      exerciseWindowSize: 24 * 60 * 60, // 24h
    }

    const tx = optionBuilder.buildOption(
      optionData.name,
      optionData.symbol,
      EXERCISE_TYPE_EUROPEAN,
      underlyingAsset.address,
      strikeAsset.address,
      optionData.strikePrice,
      optionData.expiration,
      optionData.exerciseWindowSize,
      configurationManager.address
    )

    await expect(tx).to.not.be.reverted
  })
})
