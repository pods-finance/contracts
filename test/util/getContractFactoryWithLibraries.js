const { config } = require('@nomiclabs/buidler')
const { readArtifact } = require('@nomiclabs/buidler/plugins')
const linkBytecode = require('./linkBytecode')

module.exports = async function getContractFactoryWithLibraries (contract, libraries) {
  const artifact = await readArtifact(config.paths.artifacts, contract)
  const Contract = await ethers.getContractFactory(
    artifact.abi,
    linkBytecode(artifact, libraries)
  )
  return Contract
}
