const linkBytecode = require('../../test/util/linkBytecode')

module.exports = async function getContractFactoryWithLibraries (contract, libraries) {
  const teste = await hre.artifacts.getArtifactPaths()
  console.log(teste)
  const artifact = await hre.artifacts.readArtifact(contract)
  const Contract = await ethers.getContractFactory(
    artifact.abi,
    linkBytecode(artifact, libraries)
  )
  return Contract
}
