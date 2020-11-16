module.exports = async function forceExpiration (option, number) {
  let expirableTimestamp = number
  if (!number) {
    expirableTimestamp = (await option.expiration()).toNumber()
  }
  await ethers.provider.send('evm_mine', [expirableTimestamp])
}
