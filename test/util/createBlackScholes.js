
module.exports = async function createBlackScholes () {
  const NormalDistribution = await ethers.getContractFactory('NormalDistribution')
  const normalDistribution = await NormalDistribution.deploy()

  const BlackScholes = await ethers.getContractFactory('BlackScholes')

  const bs = await BlackScholes.deploy(normalDistribution.address)
  await bs.deployed()
  return bs
}
