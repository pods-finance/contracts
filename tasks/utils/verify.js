
module.exports = async function verify (hre, contractAddress, constructorArguments = [], libraryObj) {
  console.log('--Starting Verify Process--')
  const verifyObj = {
    address: contractAddress,
    constructorArguments
  }

  if (libraryObj) {
    verifyObj.libraries = libraryObj
  }

  await hre.run('verify:verify', verifyObj)
}
