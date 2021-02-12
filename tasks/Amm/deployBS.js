
const saveJSON = require('../utils/saveJSON')

internalTask('deployBS', 'Deploy Black Scholes')
  .addParam('normaldist', 'Normal Distribution Address')
  .addOptionalParam('fixidity', 'fixidity address to use')
  .addOptionalParam('logarithm', 'logarithm address to use')
  .addOptionalParam('exponent', 'exponent address to use')
  .addFlag('deploylibs', 'Activate this parameter if you want to deploy libs')
  .setAction(async ({ normaldist, fixidity, logarithm, deploylibs }, hre) => {
    const path = `../../deployments/${hre.network.name}.json`
    let libs = {
      fixidity,
      logarithm
    }

    if (deploylibs) {
      libs = await run('deployLibs')
    }

    console.log('libs', libs)

    const BlackScholes = await hre.ethers.getContractFactory('BlackScholes', {
      libraries: {
        FixidityLib: libs.fixidity,
        LogarithmLib: libs.logarithm
      }
    })

    const bs = await BlackScholes.deploy(normaldist)
    await bs.deployed()
    await saveJSON(path, { blackScholes: bs.address })
    console.log('BlackScholes Address', bs.address)
    return bs.address
  })
