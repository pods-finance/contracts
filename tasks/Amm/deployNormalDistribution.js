
internalTask('deployNormalDistribution', 'Deploy Normal Distribution Contract')
  .setAction(async () => {
    console.log('----Start Deploy Normal Distribution----')
    const NormalDistributionContract = await ethers.getContractFactory('NormalDistribution')
    const normalDistribution = await NormalDistributionContract.deploy()

    await normalDistribution.deployed()
    console.log('Normal Distribution Address', normalDistribution.address)
  })
