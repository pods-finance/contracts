
internalTask('deployLibs', 'Deploy Math Libs')
  .setAction(async ({}, hre) => {
    console.log('----Start Deploy Libs----')
    const FixidityLib = await hre.ethers.getContractFactory('FixidityLib')
    const fixidity = await FixidityLib.deploy()
    await fixidity.deployed()

    console.log('fixidity Address', fixidity.address)

    const LogarithmLib = await hre.ethers.getContractFactory('LogarithmLib', {
      libraries: {
        FixidityLib: fixidity.address
      }
    })
    const logarithm = await LogarithmLib.deploy()
    await logarithm.deployed()

    console.log('logarithm Address', logarithm.address)

    const ExponentLib = await hre.ethers.getContractFactory('ExponentLib', {
      libraries: {
        FixidityLib: fixidity.address,
        LogarithmLib: logarithm.address
      }
    })
    const exponent = await ExponentLib.deploy()
    await exponent.deployed()

    console.log('exponent Address', exponent.address)
    return { fixidity: fixidity.address, logarithm: logarithm.address, exponent: exponent.address }
  })
