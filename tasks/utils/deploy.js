
task('deploy', 'Deploy a generic contract given artifact name')
  .addParam('name', 'token symbol')
  .setAction(async ({ name }) => {
    console.log('----Start Deploy Contract----')
    const Contract = await ethers.getContractFactory(name)
    const contract = await Contract.deploy()

    await contract.deployed()
    console.log(`${name} Address: ${contract.address}`)
    return contract.address
  })
