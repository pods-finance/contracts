
const getContractFactoryWithLibraries = require('../utils/getContractFactoryWithLibraries')

internalTask('deployLibs', 'Deploy Math Libs')
  .setAction(async ({}, bre) => {
    console.log('----Start Deploy Libs----')
    const FixidityLib = await ethers.getContractFactory('FixidityLib')
    const fixidity = await FixidityLib.deploy()
    await fixidity.deployed()

    console.log('fixidity Address', fixidity.address)

    const LogarithmLib = await getContractFactoryWithLibraries('LogarithmLib', {
      FixidityLib: fixidity.address
    }, bre.config.paths.artifacts)
    const logarithm = await LogarithmLib.deploy()
    await logarithm.deployed()

    console.log('logarithm Address', logarithm.address)

    const ExponentLib = await getContractFactoryWithLibraries('ExponentLib', {
      FixidityLib: fixidity.address,
      LogarithmLib: logarithm.address
    }, bre.config.paths.artifacts)
    const exponent = await ExponentLib.deploy()
    await exponent.deployed()

    console.log('exponent Address', exponent.address)
    return { fixidity: fixidity.address, logarithm: logarithm.address, exponent: exponent.address }
  })
