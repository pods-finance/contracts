async function forceExpiration (option) {
  const untilThisBlock = await option.expirationBlockNumber()
  let currentBlock = await ethers.provider.getBlockNumber()
  while (currentBlock <= untilThisBlock) {
    await ethers.provider.send('evm_mine')
    currentBlock++
  }
}

module.exports = forceExpiration
