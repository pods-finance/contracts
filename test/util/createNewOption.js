
module.exports = async function createNewOption (deployerAddress, factoryContract, name, symbol, optionType, underlyingAsset, strikeAsset, strikePrice, expiration, exerciseWindowSize) {
  let podPut
  const txIdNewOption = await factoryContract.createOption(
    name,
    symbol,
    optionType,
    underlyingAsset,
    strikeAsset,
    strikePrice,
    expiration,
    exerciseWindowSize
  )

  const filterFrom = await factoryContract.filters.OptionCreated(deployerAddress)
  const eventDetails = await factoryContract.queryFilter(filterFrom, txIdNewOption.blockNumber, txIdNewOption.blockNumber)

  if (eventDetails.length) {
    const { option } = eventDetails[0].args
    podPut = await ethers.getContractAt('PodPut', option)
  } else {
    console.log('Something went wrong: No events found')
  }

  await podPut.deployed()
  return podPut
}
