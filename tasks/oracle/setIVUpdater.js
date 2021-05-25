task('setIVUpdater', 'Set a ConfigurationManager parameter')
  .addPositionalParam('updater', 'updater role address')
  .addOptionalParam('configurator', 'An address of a deployed ConfigurationManager, defaults to current `deployments` json file')
  .setAction(async ({ configurator, updater }, bre) => {
    const filePath = `../../deployments/${bre.network.name}.json`

    if (!configurator) {
      const json = require(filePath)
      configurator = json.ConfigurationManager
    }

    if (!ethers.utils.isAddress(configurator)) {
      throw new Error(`\`configurator\` is not an address. Received: ${configurator}`)
    }

    if (!ethers.utils.isAddress(updater)) {
      throw new Error(`\`updater\` is not an address. Received: ${updater}`)
    }

    const configurationManager = await ethers.getContractAt('ConfigurationManager', configurator)
    const ivProviderAddress = await configurationManager.getIVProvider()
    const ivProvider = await ethers.getContractAt('IVProvider', ivProviderAddress)

    const currentUpdater = await ivProvider.updater()

    console.log(`Setting IVProvider Updater\nConfigurationManager(${configurationManager.address})\nIVProvider(${ivProvider.address})\nValue: ${currentUpdater} → ${updater}`)

    const tx = await ivProvider.setUpdater(updater)
    const txReceipt = await tx.wait()
    console.log(`Done! Transaction hash: ${txReceipt.transactionHash}`)
  })
