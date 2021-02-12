const { ethers } = require('hardhat')
const { expect,  } = require('chai')
const { toBigNumber } = require('../../utils/utils')

describe('Logarithm', () => {
  let Logarithm, log

  before(async () => {
    const FixidityLib = await ethers.getContractFactory('FixidityLib')
    const fixidity = await FixidityLib.deploy()
    await fixidity.deployed()

    const LogarithmLib = await ethers.getContractFactory('LogarithmLib', {
      libraries: {
        FixidityLib: fixidity.address
      }
    })
    const logarithm = await LogarithmLib.deploy()
    await logarithm.deployed()

    Logarithm = await ethers.getContractFactory('LogarithmUser', {
      libraries: {
        LogarithmLib: logarithm.address
      }
    })

    log = await Logarithm.deploy()
  })

  const scenarios = [
    [toBigNumber(1e24), toBigNumber(0)],
    [toBigNumber(2e24), toBigNumber(0.693147180559945309417232e24)],
    [toBigNumber(2718281828459045235360287), toBigNumber(1e24)],
    [toBigNumber(0.5e24), toBigNumber(-0.693147180559945309417232e24)],
    [toBigNumber(50e24), toBigNumber(3.91202300542814605861e24)],
  ]

  scenarios.forEach(([value, expected]) => {
    it(`calculates ln for ${value}`, async () => {
      expect(compareDecimals(await log.ln(value), expected, 12)).to.be.true
    })
  })
})

function compareDecimals (a, b, decimals) {
  const A = parseInt(a.toString()).toPrecision(decimals)
  const B = parseInt(b.toString()).toPrecision(decimals)

  return A === B
}
