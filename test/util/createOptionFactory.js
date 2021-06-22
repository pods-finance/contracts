module.exports = async function createOptionFactory (wethAddress, configurationManager) {
  const [PodPutBuilder, WPodPutBuilder, AavePodPutBuilder, PodCallBuilder, WPodCallBuilder, AavePodCallBuilder, OptionFactory] = await Promise.all([
    ethers.getContractFactory('PodPutBuilder'),
    ethers.getContractFactory('WPodPutBuilder'),
    ethers.getContractFactory('AavePodPutBuilder'),
    ethers.getContractFactory('PodCallBuilder'),
    ethers.getContractFactory('WPodCallBuilder'),
    ethers.getContractFactory('AavePodCallBuilder'),
    ethers.getContractFactory('OptionFactory')
  ])

  const [podPutBuilder, wPodPutBuilder, aavePodPutBuilder, podCallBuilder, wPodCallBuilder, aavePodCallBuilder] = await Promise.all([
    PodPutBuilder.deploy(),
    WPodPutBuilder.deploy(),
    AavePodPutBuilder.deploy(),
    PodCallBuilder.deploy(),
    WPodCallBuilder.deploy(),
    AavePodCallBuilder.deploy()
  ])

  const factoryContract = await OptionFactory.deploy(
    wethAddress,
    podPutBuilder.address,
    wPodPutBuilder.address,
    aavePodPutBuilder.address,
    podCallBuilder.address,
    wPodCallBuilder.address,
    aavePodCallBuilder.address,
    configurationManager.address
  )
  await factoryContract.deployed()
  return factoryContract
}
