module.exports = async function forceStartOfExerciseWindow (option) {
  const expirableTimestamp = (await option.startOfExerciseWindow()).toNumber()
  await ethers.provider.send('evm_mine', [expirableTimestamp])
}
