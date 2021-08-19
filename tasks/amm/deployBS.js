const validateAddress = require('../utils/validateAddress')

task('deployBS', 'Deploy Black Scholes')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .addOptionalParam('normaldist', 'Normal Distribution Address')
  .setAction(async ({ normaldist, verify }, hre) => {
    if (!ethers.utils.isAddress(normaldist)) {
      normaldist = await hre.run('deployNormalDistribution', {
        verify
      })
    }

    validateAddress(normaldist, 'normaldist')

    const bsAddress = await hre.run('deploy', {
      name: 'BlackScholes',
      args: [normaldist],
      save: true,
      verify
    })

    return bsAddress
  })
