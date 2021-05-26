const { types } = require('hardhat/config')
const verifyContract = require('../utils/verify')
const { saveDeployments } = require('../utils/deployment')

task('deploy', 'Deploy a generic contract given artifact name')
  .addParam('name', 'name of the contract artifact')
  .addOptionalParam('args', 'arguments passed to constructor', [], types.json)
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .addFlag('save', 'if true, it should save the contract address inside the deployments folder')
  .setAction(async ({ name, args = [], verify, save }, hre) => {
    console.log(`Deploying ${name}`)
    if (args.length) {
      if (typeof args === 'string') {
        args = args.split(',')
      }
      console.log(`With args: `, args)
    }
    const numberOfConfirmations = hre.network.name === 'local' ? 1 : 2
    const Contract = await ethers.getContractFactory(name)
    const contract = await Contract.deploy(...args)
    await contract.deployTransaction.wait(numberOfConfirmations)

    console.log(`Deployed ${name}: ${contract.address}`)

    if (verify) {
      await verifyContract(hre, contract.address, args)
    }

    if (save) {
      await saveDeployments({
        [name]: contract.address
      })
    }

    return contract.address
  })
