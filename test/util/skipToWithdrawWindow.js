const { ethers } = require('hardhat')

/**
 * Fast forwards to the withdraw window of an option
 * @param option {ethers.Contract} The option
 * @return {Promise<void>}
 */
module.exports = async function skipToWithdrawWindow (option) {
  const expirableTimestamp = (await option.expiration()).toNumber()
  await ethers.provider.send('evm_mine', [expirableTimestamp])
}
