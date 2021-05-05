task('emergencyStop', 'Interact with a EmergencyStop connected to a ConfigurationManager')
  .addOptionalParam('address', 'An address of a deployed ConfigurationManager, defaults to current `deployments` json file')
  .addPositionalParam('command', 'The command to send. stop, resume, isStopped')
  .addPositionalParam('contract', 'The contract address to interact')
  .setAction(async ({ address, command, contract }, hre) => {
    const filePath = `../../deployments/${hre.network.name}.json`

    if (!address) {
      const json = require(filePath)
      address = json.configurationManager
    }

    if (!ethers.utils.isAddress(address)) {
      throw new Error(`\`address\` is not an address. Received: ${address}`)
    }

    if (!ethers.utils.isAddress(contract)) {
      throw new Error(`\`contract\` is not an address. Received: ${contract}`)
    }

    const configurationManager = await ethers.getContractAt('ConfigurationManager', address)
    const emergencyStop = await ethers.getContractAt('EmergencyStop', await configurationManager.getEmergencyStop())

    let transaction

    switch (command) {
      case 'stop':
        console.log(`Stopping contract: ${contract}`)
        transaction = await emergencyStop.stop(contract)
        await transaction.wait(1)
        console.log('Done!')
        break
      case 'resume':
        console.log(`Resuming contract: ${contract}`)
        transaction = await emergencyStop.resume(contract)
        await transaction.wait(1)
        console.log('Done!')
        break
      case 'isStopped':
        const response = (await emergencyStop.isStopped(contract)) ? 'true' : 'false'
        console.log(`Contract: ${contract} is stopped: ${response}`)
        break
      default:
        throw new Error('Command not found! Available commands: stop, resume, isStopped')
    }
  })
