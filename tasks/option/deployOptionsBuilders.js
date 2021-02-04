
const saveJSON = require('../utils/saveJSON')

internalTask('deployBuilder', 'Deploy OptionFactory or aOptionFactory')
  .addParam('optiontype', 'Eg: PodPut, WPodPut, PodCall, WPodCall')
  .setAction(async ({ optiontype }, bre) => {
    const path = `../../deployments/${bre.network.name}.json`
    console.log(`====== Start ${optiontype} Builder deploy ======`)

    const contractName = optiontype + 'Builder'
    const OptionBuilder = await ethers.getContractFactory(contractName)
    const builder = await OptionBuilder.deploy()

    await builder.deployed()

    console.log(`${contractName} deployed to:`, builder.address)

    await saveJSON(path, { [contractName]: builder.address })

    return builder.address
  })
