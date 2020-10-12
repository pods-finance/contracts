
internalTask('deploySigma', 'Deploy Sigma Contract')
  .addParam('bs', 'Black Scholes Address')
  .setAction(async ({ bs }) => {
    console.log('----Start Deploy Sigma----')
    const SigmaContract = await ethers.getContractFactory('Sigma')
    const sigma = await SigmaContract.deploy(bs)

    await sigma.deployed()
    console.log('Sigma Address', sigma.address)
    return sigma.address
  })
