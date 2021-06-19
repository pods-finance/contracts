const validateAddress = require('../utils/validateAddress')

internalTask('deployBS', 'Deploy Black Scholes')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .addParam('normaldist', 'Normal Distribution Address')
  .setAction(async ({ normaldist, verify }, hre) => {
    validateAddress(normaldist, 'normaldist')

    const bsAddress = await hre.run('deploy', {
      name: 'BlackScholes',
      args: [normaldist],
      save: true,
      verify
    })

    return bsAddress
  })
