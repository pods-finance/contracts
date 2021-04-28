const verifyContract = require('../utils/verify')

task('deploy', 'Deploy a generic contract given artifact name')
  .addParam('name', 'name of the contract artifact')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .setAction(async ({ name, verify }) => {
    console.log('----Start Deploy Contract----')
    const numberOfConfirmations = hre.network.name === 'local' ? 1 : 2
    const Contract = await ethers.getContractFactory(name)
    const contract = await Contract.deploy()
    await contract.deployTransaction.wait(numberOfConfirmations)

    if (verify) {
      hre.run('verify:verify', { contract: name, address: contract.address })
    }

    console.log(`${name} Address: ${contract.address}`)

    if(verify) {
        await verifyContract(hre, contract.address)
    }

    return contract.address
  })
