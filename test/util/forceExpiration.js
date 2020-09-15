module.exports = async function forceExpiration (option) {
  const expirableTimestamp = (await option.expiration()).toNumber()
  await ethers.provider.send('evm_setNextBlockTimestamp', [expirableTimestamp])
  await ethers.provider.send('evm_mine')
}
