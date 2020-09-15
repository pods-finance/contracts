async function forceEndOfExerciseWindow (option) {
    const untilThisBlock = await option.endOfExerciseWindowBlockNumber()
    let currentBlock = await ethers.provider.getBlockNumber()
    while (currentBlock <= untilThisBlock) {
      await ethers.provider.send('evm_mine')
      currentBlock++
    }
  }
  
  module.exports = forceEndOfExerciseWindow
  