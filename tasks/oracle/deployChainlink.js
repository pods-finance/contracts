const validateAddress = require('../utils/validateAddress')

task('deployChainlink', 'Deploy Chainlink Contract')
  .addParam('source', 'address of chainlink pricefeed')
  .addFlag('save', 'if true, it should save the contract address inside the deployments folder')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .setAction(async ({ source, save, verify }, hre) => {
    validateAddress(source, 'source')

    const address = await hre.run('deploy', {
      name: 'ChainlinkPriceFeed',
      args: [source],
      save,
      verify
    })

    return address
  })
