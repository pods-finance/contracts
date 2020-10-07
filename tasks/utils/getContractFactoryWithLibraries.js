const { readArtifact } = require('@nomiclabs/buidler/plugins')
const linkBytecode = require('../../test/util/linkBytecode')

module.exports = async function getContractFactoryWithLibraries (contract, libraries, path) {
  const artifact = await readArtifact(path, contract)
  const Contract = await ethers.getContractFactory(
    artifact.abi,
    linkBytecode(artifact, libraries)
  )
  return Contract
}
