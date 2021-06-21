
module.exports = async function verify (hre, contractAddress, constructorArguments = [], libraryObj) {
  console.log('--Starting Verify Process--')
  const verifyObj = {
    address: contractAddress,
    constructorArguments
  }

  if (libraryObj) {
    verifyObj.libraries = libraryObj
  }

  if (hre.network.name === 'matic') {
    hre.config.etherscan.apiKey = process.env.POLYGONCAN_APIKEY
  }

  await hre.run('verify:verify', verifyObj)
}
