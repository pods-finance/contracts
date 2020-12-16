
const getContractFactoryWithLibraries = require('../utils/getContractFactoryWithLibraries')
const saveJSON = require('../utils/saveJSON')

internalTask('deployBS', 'Deploy Black Scholes')
  .addParam('normaldist', 'Normal Distribution Address')
  .addOptionalParam('fixidity', 'fixidity address to use')
  .addOptionalParam('logarithm', 'logarithm address to use')
  .addOptionalParam('exponent', 'exponent address to use')
  .addFlag('deploylibs', 'Activate this parameter if you want to deploy libs')
  .setAction(async ({ normaldist, fixidity, logarithm, exponent, deploylibs }, bre) => {
    const path = `../../deployments/${bre.network.name}.json`
    let libs = {
      fixidity,
      logarithm,
      exponent
    }

    if (deploylibs) {
      libs = await run('deployLibs')
    }

    console.log('libs', libs)
    const BlackScholes = await getContractFactoryWithLibraries('BlackScholes', {
      FixidityLib: libs.fixidity,
      LogarithmLib: libs.logarithm,
      ExponentLib: libs.exponent
    }, bre.config.paths.artifacts)

    const bs = await BlackScholes.deploy(normaldist)
    await bs.deployed()
    await saveJSON(path, { blackScholes: bs.address })
    console.log('BlackScholes Address', bs.address)
    return bs.address
  })
