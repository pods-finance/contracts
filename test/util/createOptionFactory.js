module.exports = async function createOptionFactory (wethAddress, configurationManager) {
  const [PodPutBuilder, WPodPutBuilder, PodCallBuilder, WPodCallBuilder, OptionFactory] = await Promise.all([
    ethers.getContractFactory('PodPutBuilder'),
    ethers.getContractFactory('WPodPutBuilder'),
    ethers.getContractFactory('PodCallBuilder'),
    ethers.getContractFactory('WPodCallBuilder'),
    ethers.getContractFactory('OptionFactory')
  ])

  const [podPutBuilder, wPodPutBuilder, podCallBuilder, wPodCallBuilder] = await Promise.all([
    PodPutBuilder.deploy(),
    WPodPutBuilder.deploy(),
    PodCallBuilder.deploy(),
    WPodCallBuilder.deploy()
  ])

  const factoryContract = await OptionFactory.deploy(
    wethAddress,
    podPutBuilder.address,
    wPodPutBuilder.address,
    podCallBuilder.address,
    wPodCallBuilder.address,
    configurationManager.address
  )
  await factoryContract.deployed()
  return factoryContract
}
