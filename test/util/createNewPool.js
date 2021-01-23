module.exports = async function createNewPool (deployerAddress, factoryContract, _optionAddress, _stableAsset, _initialSigma) {
  let optionPool
  const txIdNewOption = await factoryContract.createPool(
    _optionAddress,
    _stableAsset,
    _initialSigma
  )
  const filterFrom = await factoryContract.filters.PoolCreated(deployerAddress)
  const eventDetails = await factoryContract.queryFilter(filterFrom, txIdNewOption.blockNumber, txIdNewOption.blockNumber)

  if (eventDetails.length) {
    const { pool } = eventDetails[0].args
    optionPool = await ethers.getContractAt('OptionAMMPool', pool)
  } else {
    console.log('Something went wrong: No events found')
  }

  await optionPool.deployed()
  return optionPool
}
