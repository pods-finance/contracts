internalTask('deployNormalDistribution', 'Deploy Normal Distribution Contract')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .setAction(async ({ verify }, hre) => {
    const address = await hre.run('deploy', {
      name: 'NormalDistribution',
      save: true,
      verify
    })

    return address
  })
