const { getDeployments } = require('../utils/deployment')
const validateAddress = require('../utils/validateAddress')

task('emergencyStop', 'Interact with a EmergencyStop connected to a ConfigurationManager')
  .addOptionalParam('address', 'An address of a deployed ConfigurationManager, defaults to current `deployments` json file')
  .addPositionalParam('command', 'The command to send. stop, resume, isStopped')
  .addPositionalParam('contract', 'The contract address to interact')
  .setAction(async ({ address, command, contract }, hre) => {
    if (!address) {
      const deployment = getDeployments()
      address = deployment.ConfigurationManager
    }

    validateAddress(address, 'address')
    validateAddress(contract, 'contract')

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
