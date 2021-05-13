task('setParameter', 'Set a ConfigurationManager parameter')
  .addPositionalParam('parameter', 'Parameter name')
  .addPositionalParam('value', 'New value')
  .addOptionalParam('configurator', 'An address of a deployed ConfigurationManager, defaults to current `deployments` json file')
  .addFlag('noUpdate', 'Specifies if the param change should trigger update on dependent contract, defaults to true')
  .setAction(async ({ configurator, parameter, value, noUpdate }, bre) => {
    const filePath = `../../deployments/${bre.network.name}.json`

    if (!configurator) {
      const json = require(filePath)
      configurator = json.configurationManager
    }

    if (!ethers.utils.isAddress(configurator)) {
      throw new Error(`\`configurator\` is not an address. Received: ${configurator}`)
    }

    const configurationManager = await ethers.getContractAt('ConfigurationManager', configurator)

    const parameterName = ethers.utils.formatBytes32String(parameter)
    const parameterValue = ethers.BigNumber.from(value)
    const currentValue = (await configurationManager.getParameter(parameterName)).toString()

    console.log(`Setting ConfigurationManager(${configurationManager.address})\nParameter: ${parameter}\nValue: ${currentValue} → ${value}`)

    const tx = await configurationManager.setParameter(parameterName, parameterValue)
    const txReceipt = await tx.wait()
    console.log(`Done! Transaction hash: ${txReceipt.transactionHash}`)

    if (!noUpdate) {
      let updateTx, updateReceipt

      switch (parameter) {
        case 'MIN_UPDATE_INTERVAL':
          const priceProvider = await ethers.getContractAt('PriceProvider', await configurationManager.getPriceProvider())
          console.log(`Updating PriceProvider(${priceProvider.address})`)
          updateTx = await priceProvider.updateMinUpdateInterval()
          updateReceipt = await updateTx.wait()
          console.log(`Done! Transaction hash: ${updateReceipt.transactionHash}`)
          break
        case 'GUESSER_ACCEPTABLE_RANGE':
          const sigmaGuesser = await ethers.getContractAt('SigmaGuesser', await configurationManager.getSigmaGuesser())
          console.log(`Updating SigmaGuesser(${sigmaGuesser.address})`)
          updateTx = await sigmaGuesser.updateAcceptableRange()
          updateReceipt = await updateTx.wait()
          console.log(`Done! Transaction hash: ${updateReceipt.transactionHash}`)
          break
      }
    }
  })
