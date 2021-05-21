const verifyContract = require('../utils/verify')
const saveJSON = require('../utils/saveJSON')

task('deploy', 'Deploy a generic contract given artifact name')
  .addParam('name', 'name of the contract artifact')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .addFlag('save', 'if true, it should save the contract address inside the deployments folder')
  .setAction(async ({ name, verify, save }) => {
    console.log('----Start Deploy Contract----')
    const numberOfConfirmations = hre.network.name === 'local' ? 1 : 2
    const Contract = await ethers.getContractFactory(name)
    const contract = await Contract.deploy()
    await contract.deployTransaction.wait(numberOfConfirmations)

    console.log(`${name} Address: ${contract.address}`)

    if (verify) {
      await verifyContract(hre, contract.address)
    }

    if (save) {
      const saveObj = {
        [name]: contract.address
      }

      await saveJSON(`../../deployments/${hre.network.name}.json`, saveObj)
    }

    return contract.address
  })
