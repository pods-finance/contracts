module.exports = async function forceEndOfExerciseWindow (option) {
  const expirableTimestamp = (await option.endOfExerciseWindow()).toNumber()
  await ethers.provider.send('evm_mine', [expirableTimestamp])
}
