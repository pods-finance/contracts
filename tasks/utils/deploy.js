
task('deploy', 'Deploy a generic contract given artifact name')
  .addParam('name', 'name of the contract artifact')
  .addFlag('verify', 'set true to verify contract to etherscan')
  .setAction(async ({ name, verify }, hre) => {
    const numberOfConfirmations = hre.network.name === 'local' ? 1 : 2
    console.log('----Start Deploy Contract----')
    const Contract = await ethers.getContractFactory(name)
    const contract = await Contract.deploy()
    await contract.deployTransaction.wait(numberOfConfirmations)

    if (verify) {
      hre.run('verify:verify', { contract: name, address: contract.address })
    }

    console.log(`${name} Address: ${contract.address}`)
    return contract.address
  })
