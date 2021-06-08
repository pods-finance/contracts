task('deployIVProvider', 'Deploy Implied Volatility Contract')
  .addOptionalParam('updater', 'updater role address')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .setAction(async ({ updater, verify }, hre) => {
    const address = await hre.run('deploy', {
      name: 'IVProvider',
      verify,
      save: true
    })

    const numberOfConfirmations = hre.network.name === 'local' ? 1 : 2
    const provider = await ethers.getContractAt('IVProvider', address)

    if (ethers.utils.isAddress(updater)) {
      await provider.setUpdater(updater).wait(numberOfConfirmations)
    }

    return provider.address
  })
