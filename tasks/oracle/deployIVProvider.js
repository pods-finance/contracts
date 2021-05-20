const verifyContract = require('../utils/verify')

task('deployIVProvider', 'Deploy Implied Volatility Contract')
  .addOptionalParam('updater', 'updater role address')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .setAction(async ({ updater, verify }) => {
    console.log('Deploying IVProvider')
    const numberOfConfirmations = hre.network.name === 'local' ? 1 : 2

    const IVPriceFeed = await ethers.getContractFactory('IVPriceFeed')
    const provider = await IVPriceFeed.deploy()
    await provider.deployTransaction.wait(numberOfConfirmations)

    if (ethers.utils.isAddress(updater)) {
      await provider.setUpdater(updater).wait(numberOfConfirmations)
    }

    if (verify) {
      await verifyContract(hre, provider.address)
    }

    console.log(`IVProvider: ${provider.address}`)
    return provider.address
  })
