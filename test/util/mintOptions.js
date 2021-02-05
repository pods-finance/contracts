const { ethers } = require('hardhat')

const OPTION_TYPE_PUT = 0
const OPTION_TYPE_CALL = 1

/**
 * Seamlessly mint options based on their type and asset to transfer
 *
 * @param option {ethers.Contract} The option to mint from
 * @param amount {ethers.BigNumber} Amount to mint in BigNumber
 * @param [owner] {ethers.Signer} The Signer to be the owner of minted options
 * @return {Promise<ethers.BigNumber>} Current balance of minted options
 */
module.exports = async function mintOptions (option, amount, owner) {
  if (owner == null) {
    const signers = await ethers.getSigners()
    owner = signers[0]
  }

  const ownerAddress = await owner.getAddress()
  const optionType = await option.optionType()
  let collateralAmount, collateralAddress

  if (optionType === OPTION_TYPE_PUT) {
    // Minting PUT options, in this case the collateral to mint is the strike asset
    collateralAddress = await option.strikeAsset()
    collateralAmount = await option.strikeToTransfer(amount)
  } else if (optionType === OPTION_TYPE_CALL) {
    // Minting CALL options, in this case the collateral to mint is the underlying asset
    collateralAddress = await option.underlyingAsset()
    collateralAmount = amount
  } else {
    throw new Error('Option Type not found.')
  }

  const collateralAsset = await ethers.getContractAt(
    'MintableERC20',
    collateralAddress
  )
  await collateralAsset.connect(owner).mint(collateralAmount)
  await collateralAsset.connect(owner).approve(option.address, collateralAmount)
  await option.connect(owner).mint(amount, ownerAddress)

  return option.balanceOf(ownerAddress)
}
