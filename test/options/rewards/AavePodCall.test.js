const { ethers, waffle: { deployMockContract } } = require('hardhat')
const { expect } = require('chai')
const IAaveIncentivesController = require('../../../abi/IAaveIncentivesController.json')
const createConfigurationManager = require('../../util/createConfigurationManager')
const mintOptions = require('../../util/mintOptions')
const skipToWithdrawWindow = require('../../util/skipToWithdrawWindow')
const getTimestamp = require('../../util/getTimestamp')
const { takeSnapshot, revertToSnapshot } = require('../../util/snapshot')

describe('AavePodCall', () => {
  let snapshotId
  let deployer, minter0, minter1
  let AavePodCall, MintableInterestBearing
  let configurationManager, underlyingAsset, strikeAsset, option, aaveRewardDistributor

  const amountToMint = ethers.BigNumber.from(1e18.toString())
  const strikePrice = ethers.BigNumber.from(300e18.toString())
  const claimable = ethers.BigNumber.from(20e18.toString())

  before(async () => {
    ;[deployer, minter0, minter1] = await ethers.getSigners()
    ;[AavePodCall, MintableInterestBearing, configurationManager, aaveRewardDistributor] = await Promise.all([
      ethers.getContractFactory('AavePodCall'),
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

    option = await AavePodCall.deploy(
      'Pods Call WETH:aDAI 1200 2021-06-11',
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

  it('unmints entirely and gets the rewards', async () => {
    await mintOptions(option, amountToMint, minter0)
    await option.connect(minter0).unmintWithRewards(amountToMint)
    expect(await option.balanceOf(minter0.address)).to.be.equal(0)
    expect(await underlyingAsset.balanceOf(minter0.address)).to.be.equal(amountToMint)
    expect(await rewardToken.balanceOf(minter0.address)).to.be.equal(claimable)
  })

  it('unmints partially and gets partial rewards', async () => {
    await mintOptions(option, amountToMint, minter0)
    await mintOptions(option, amountToMint, minter1)

    const partialAmountToUnmint = amountToMint.div(2)
    const partialCollateralAmount = partialAmountToUnmint

    // Minter 0 unminting partially
    await option.connect(minter0).unmintWithRewards(partialAmountToUnmint)
    expect(await option.balanceOf(minter0.address)).to.be.equal(partialAmountToUnmint)
    expect(await underlyingAsset.balanceOf(minter0.address)).to.be.equal(partialCollateralAmount)
    expect(await rewardToken.balanceOf(minter0.address)).to.be.equal(claimable.div(4))

    // Minter 1 didn't lose rewards
    await option.connect(minter1).unmintWithRewards(amountToMint)
    expect(await option.balanceOf(minter1.address)).to.be.equal(0)
    expect(await underlyingAsset.balanceOf(minter1.address)).to.be.equal(amountToMint)
    expect(await rewardToken.balanceOf(minter1.address)).to.be.equal(claimable.div(2))
  })

  it('withdraws and gets the rewards', async () => {
    await mintOptions(option, amountToMint, minter0)
    await skipToWithdrawWindow(option)
    await option.connect(minter0).withdrawWithRewards()
    expect(await option.shares(minter0.address)).to.be.equal(0)
    expect(await underlyingAsset.balanceOf(minter0.address)).to.be.equal(amountToMint)
    expect(await rewardToken.balanceOf(minter0.address)).to.be.equal(claimable)
  })
})
