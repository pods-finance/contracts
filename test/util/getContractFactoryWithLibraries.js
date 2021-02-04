const linkBytecode = require('./linkBytecode')

module.exports = async function getContractFactoryWithLibraries (contract, libraries) {
  const artifact = await hre.artifacts.readArtifact(contract)
  const Contract = await ethers.getContractFactory(
    artifact.abi,
    linkBytecode(artifact, libraries)
  )
  return Contract
}
