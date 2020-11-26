module.exports = async function createOptionFactory (wethAddress) {
  ;[PodPutBuilder, WPodPutBuilder, OptionFactory] = await Promise.all([
    ethers.getContractFactory('PodPutBuilder'),
    ethers.getContractFactory('WPodPutBuilder'),
    ethers.getContractFactory('OptionFactory')
  ])

  ;[podPutBuilder, wPodPutBuilder] = await Promise.all([
    PodPutBuilder.deploy(),
    WPodPutBuilder.deploy(wethAddress)
  ])

  const factoryContract = await OptionFactory.deploy(wethAddress, podPutBuilder.address, wPodPutBuilder.address)
  await factoryContract.deployed()
  return await ethers.getContractAt('OptionFactory', factoryContract.address)
}
