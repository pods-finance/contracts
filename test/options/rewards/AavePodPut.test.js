const { ethers, waffle: { deployMockContract } } = require('hardhat')
const { expect } = require('chai')
const IAaveIncentivesController = require('../../../abi/IAaveIncentivesController.json')
const createConfigurationManager = require('../../util/createConfigurationManager')
const mintOptions = require('../../util/mintOptions')
const skipToWithdrawWindow = require('../../util/skipToWithdrawWindow')
const getTimestamp = require('../../util/getTimestamp')
const { takeSnapshot, revertToSnapshot } = require('../../util/snapshot')

describe('AavePodPut', () => {
  let snapshotId
  let deployer, minter
  let AavePodPut, MintableInterestBearing
  let configurationManager, underlyingAsset, strikeAsset, option, aaveRewardDistributor

  const amountToMint = ethers.BigNumber.from(1e18.toString())
  const strikePrice = ethers.BigNumber.from(300e18.toString())
  const claimable = ethers.BigNumber.from(20e18.toString())

  before(async () => {
    ;[deployer, minter] = await ethers.getSigners()
    ;[AavePodPut, MintableInterestBearing, configurationManager, aaveRewardDistributor] = await Promise.all([
      ethers.getContractFactory('AavePodPut'),
      ethers.getContractFactory('MintableInterestBearing'),
      createConfigurationManager(),
      await deployMockContract(deployer, IAaveIncentivesController)
    ])
    ;[underlyingAsset, strikeAsset, rewardToken] = await Promise.all([
      MintableInterestBearing.deploy('WETH', 'WETH', 18),
      MintableInterestBearing.deploy('aDAI', 'aDAI', 18),
      MintableInterestBearing.deploy('Reward Token', 'RWD', 18)
    ])

    await configurationManager.setParameter(
      ethers.utils.formatBytes32String('REWARD_ASSET'),
      rewardToken.address
    )
    await configurationManager.setParameter(
      ethers.utils.formatBytes32String('REWARD_CONTRACT'),
      aaveRewardDistributor.address
    )

    await aaveRewardDistributor.mock.getRewardsBalance.returns(claimable)
    await aaveRewardDistributor.mock.claimRewards.returns(claimable)
  })

  beforeEach(async () => {
    snapshotId = await takeSnapshot()

    option = await AavePodPut.deploy(
      'Pods Put WETH:aDAI 1200 2021-06-11',
      'PodWETH:aDAI',
      0,
      underlyingAsset.address,
      strikeAsset.address,
      strikePrice,
      await getTimestamp() + 24 * 60 * 60 * 7,
      24 * 60 * 60, // 24h
      configurationManager.address
    )

    await rewardToken.connect(deployer).mint(claimable)
    await rewardToken.connect(deployer).transfer(option.address, claimable)
  })

  afterEach(async () => {
    await revertToSnapshot(snapshotId)
  })

  it('unmints and gets the rewards', async () => {
    await mintOptions(option, amountToMint, minter)
    await option.connect(minter).unmintWithRewards(amountToMint)
    expect(await option.balanceOf(minter.address)).to.be.equal(0)
    expect(await strikeAsset.balanceOf(minter.address)).to.be.equal(strikePrice)
    expect(await rewardToken.balanceOf(minter.address)).to.be.equal(claimable)
  })

  it('withdraws and gets the rewards', async () => {
    await mintOptions(option, amountToMint, minter)
    await skipToWithdrawWindow(option)
    await option.connect(minter).withdrawWithRewards()
    expect(await option.shares(minter.address)).to.be.equal(0)
    expect(await strikeAsset.balanceOf(minter.address)).to.be.equal(strikePrice)
    expect(await rewardToken.balanceOf(minter.address)).to.be.equal(claimable)
  })
})
