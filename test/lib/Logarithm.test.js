const { ethers } = require('hardhat')
const { expect,  } = require('chai')
const { toBigNumber } = require('../../utils/utils')

describe('Logarithm', () => {
  let Logarithm, log

  before(async () => {
    Logarithm = await ethers.getContractFactory('LogarithmUser')
    log = await Logarithm.deploy()
  })

  const scenarios = [
    [toBigNumber(1e18), toBigNumber(0)],
    [toBigNumber(2e18), toBigNumber(0.693147180559945309417232e18)],
    [toBigNumber(2.718281828459045235e18), toBigNumber(1e18)],
    [toBigNumber(0.5e18), toBigNumber(-0.693147180559945309417232e18)],
    [toBigNumber(50e18), toBigNumber(3.91202300542814605861e18)],
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
