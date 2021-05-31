const { getDeployments } = require('../utils/deployment')
const validateAddress = require('../utils/validateAddress')

task('setIVUpdater', 'Set a ConfigurationManager parameter')
  .addPositionalParam('updater', 'updater role address')
  .addOptionalParam('configuration', 'An address of a deployed ConfigurationManager, defaults to current `deployments` json file')
  .setAction(async ({ configuration, updater }, bre) => {
    if (!configuration) {
      const deployment = getDeployments()
      configuration = deployment.ConfigurationManager
    }

    validateAddress(configuration, 'configuration')
    validateAddress(updater, 'updater')

    const configurationManager = await ethers.getContractAt('ConfigurationManager', configuration)
    const ivProviderAddress = await configurationManager.getIVProvider()
    const ivProvider = await ethers.getContractAt('IVProvider', ivProviderAddress)

    const currentUpdater = await ivProvider.updater()

    console.log(`Setting IVProvider Updater\nConfigurationManager(${configurationManager.address})\nIVProvider(${ivProvider.address})\nValue: ${currentUpdater} → ${updater}`)

    const tx = await ivProvider.setUpdater(updater)
    const txReceipt = await tx.wait()
    console.log(`Done! Transaction hash: ${txReceipt.transactionHash}`)
  })
