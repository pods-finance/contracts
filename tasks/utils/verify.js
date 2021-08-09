
module.exports = async function verify (hre, address, constructorArguments = [], libraries) {
  console.log('--Starting Verify Process--')
  const verifyData = {
    address,
    constructorArguments
  }

  if (libraries) {
    verifyData.libraries = libraries
  }

  if (hre.network.name === 'matic') {
    hre.config.etherscan.apiKey = process.env.POLYGONSCAN_APIKEY
  }

  await hre.run('verify:verify', verifyData)
}
