
const saveJSON = require('../utils/saveJSON')
const verifyContract = require('../utils/verify')

internalTask('deployBS', 'Deploy Black Scholes')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .addParam('normaldist', 'Normal Distribution Address')
  .addOptionalParam('fixidity', 'fixidity address to use')
  .addOptionalParam('logarithm', 'logarithm address to use')
  .addOptionalParam('exponent', 'exponent address to use')
  .addFlag('deploylibs', 'Activate this parameter if you want to deploy libs')
  .setAction(async ({ normaldist, fixidity, logarithm, deploylibs, verify }, hre) => {
    const path = `../../deployments/${hre.network.name}.json`
    let libs = {
      fixidity,
      logarithm
    }

    if (deploylibs) {
      libs = await run('deployLibs')
    }

    console.log('libs', libs)

    const libObj = {
      FixidityLib: libs.fixidity,
      LogarithmLib: libs.logarithm
    }

    const BlackScholes = await hre.ethers.getContractFactory('BlackScholes', {
      libraries: libObj
    })

    const bs = await BlackScholes.deploy(normaldist)
    await bs.deployed()
    await saveJSON(path, { blackScholes: bs.address })

    if (verify) {
      await verifyContract(hre, bs.address, [normaldist], libObj)
    }
    console.log('BlackScholes Address', bs.address)
    return bs.address
  })
