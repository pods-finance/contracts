module.exports = async function forceExpiration (option, expirableTimestamp) {
  if (!expirableTimestamp) {
    expirableTimestamp = (await option.expiration()).toNumber()
  }
  await ethers.provider.send('evm_mine', [expirableTimestamp])
}
