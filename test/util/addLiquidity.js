const { ethers } = require('hardhat')
const mintOptions = require('./mintOptions')

/**
 * Seamlessly add tokens to a pool
 *
 * @param optionAMMPool {ethers.Contract} The pool to add
 * @param amountOptions {ethers.BigNumber} Amount of options tokens to add
 * @param amountStable {ethers.BigNumber} Amount of stable tokens to add
 * @param [owner] {ethers.Signer} The Signer to be the owner of the liquidity
 */
module.exports = async function addLiquidity (
  optionAMMPool,
  amountOptions,
  amountStable,
  owner
) {
  if (owner == null) {
    const signers = await ethers.getSigners()
    owner = signers[0]
  }

  const ownerAddress = await owner.getAddress()

  const option = await ethers.getContractAt(
    'PodOption',
    await optionAMMPool.tokenA()
  )

  const stableAsset = await ethers.getContractAt(
    'MintableERC20',
    await optionAMMPool.tokenB()
  )

  await mintOptions(option, amountOptions, owner)
  await option.connect(owner).approve(optionAMMPool.address, amountOptions)

  await stableAsset.connect(owner).mint(amountStable)
  await stableAsset.connect(owner).approve(optionAMMPool.address, amountStable)

  await optionAMMPool.connect(owner).addLiquidity(amountOptions, amountStable, ownerAddress)
}
