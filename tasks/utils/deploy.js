const verifyContract = require('../utils/verify')

task('deploy', 'Deploy a generic contract given artifact name')
  .addParam('name', 'name of the contract artifact')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .setAction(async ({ name, verify }) => {
    console.log('----Start Deploy Contract----')
    const Contract = await ethers.getContractFactory(name)
    const contract = await Contract.deploy()

    await contract.deployed()
    console.log(`${name} Address: ${contract.address}`)

    if(verify) {
        await verifyContract(hre, contract.address)
    }

    return contract.address
  })
