const { getDeployments } = require('../utils/deployment')
const validateAddress = require('../utils/validateAddress')

task('increaseCap', 'Increase an option or pool cap')
  .addParam('contract', 'An address of a target address to increase cap (either option or pool')
  .addOptionalParam('value', 'new cap number')
  .addOptionalParam('configuration', 'An address of a deployed ConfigurationManager, defaults to current `deployments` json file')
  .addFlag('max', 'set pool cap to the max')
  .setAction(async ({ contract, value, configuration, max }, bre) => {
    console.log('======== START MODIFY CONTRACT CAP ==========')

    if (!configuration) {
      const deployment = getDeployments()
      configuration = deployment.ConfigurationManager
    }

    validateAddress(configuration, 'configuration')

    const configurationManager = await ethers.getContractAt('ConfigurationManager', configuration)
    const capContract = await ethers.getContractAt('CapProvider', await configurationManager.getCapProvider())
    const valueToSend = max ? 0 : value

    const tx = await capContract.setCap(contract, valueToSend)
    const txReceipt = await tx.wait()
    console.log(`transactionHash: ${txReceipt.transactionHash}`)
    console.log('======== END MODIFY CONTRACT CAP ==========')
  })
