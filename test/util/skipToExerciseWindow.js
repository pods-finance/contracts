const { ethers } = require('hardhat')

/**
 * Fast forwards to the exercise window of an option
 * @param option {ethers.Contract} The option
 * @return {Promise<void>}
 */
module.exports = async function skipToExerciseWindow (option) {
  const expirableTimestamp = (await option.startOfExerciseWindow()).toNumber()
  await ethers.provider.send('evm_mine', [expirableTimestamp])
}
