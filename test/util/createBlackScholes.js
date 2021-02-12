
module.exports = async function createBlackScholes () {
  const FixidityLib = await ethers.getContractFactory('FixidityLib')
  const fixidity = await FixidityLib.deploy()
  await fixidity.deployed()

  const LogarithmLib = await ethers.getContractFactory('LogarithmLib', {
    libraries: {
      FixidityLib: fixidity.address
    }
  })
  const logarithm = await LogarithmLib.deploy()
  await logarithm.deployed()

  const NormalDistribution = await ethers.getContractFactory('NormalDistribution')
  const normalDistribution = await NormalDistribution.deploy()
  await normalDistribution.deployed()

  const BlackScholes = await ethers.getContractFactory('BlackScholes', {
    libraries: {
      FixidityLib: fixidity.address,
      LogarithmLib: logarithm.address
    }
  })

  const bs = await BlackScholes.deploy(normalDistribution.address)
  await bs.deployed()
  return bs
}
