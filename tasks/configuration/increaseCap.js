task('increaseCap', 'Increase an option or pool cap')
  .addParam('contract', 'An address of a target address to increase cap (either option or pool')
  .addOptionalParam('value', 'new cap number')
  .addOptionalParam('configurator', 'An address of a deployed ConfigurationManager, defaults to current `deployments` json file')
  .addFlag('max', 'set pool cap to the max')
  .setAction(async ({ contract, value, configurator, max }, bre) => {
    console.log('======== START MODIFY CONTRACT CAP ==========')
    const filePath = `../../deployments/${bre.network.name}.json`

    if (!configurator) {
      const json = require(filePath)
      configurator = json.configurationManager
    }

    if (!ethers.utils.isAddress(contract)) {
      throw new Error(`\`address\` is not an address. Received: ${configurator}`)
    }

    const configurationManager = await ethers.getContractAt('ConfigurationManager', configurator)
    const capProviderAddress = await configurationManager.getCapProvider()
    const capContract = await ethers.getContractAt('CapProvider', capProviderAddress)
    const valueToSend = max ? 0 : value

    const tx = await capContract.setCap(contract, valueToSend)
    const txReceipt = await tx.wait()
    console.log(`transactionHash: ${txReceipt.transactionHash}`)
    console.log('======== END MODIFY CONTRACT CAP ==========')
  })
