const { expect } = require('chai')
const { config } = require('@nomiclabs/buidler')
const { readArtifact } = require('@nomiclabs/buidler/plugins')

const scenarios = [
  {
    spotPrice: ethers.BigNumber.from((368 * 1e18).toString()),
    strikePrice: ethers.BigNumber.from((320 * 1e18).toString()),
    sigma: ethers.BigNumber.from((1.18 * 1e18).toString()),
    riskFree: ethers.BigNumber.from(0),
    daysRemaining: ethers.BigNumber.from((6.5 * 1e18).toString()),
    expectedPutPrice: ethers.BigNumber.from((5.8 * 1e24).toString())
  }
]

describe.only('BlackScholes', () => {
  let BlackScholes, bs

  before(async () => {
    const FixidityLib = await ethers.getContractFactory('FixidityLib')
    const fixidity = await FixidityLib.deploy()
    await fixidity.deployed()

    const LogarithmLibArtifact = await readArtifact(config.paths.artifacts, 'LogarithmLib')
    const LogarithmLib = await ethers.getContractFactory(
      LogarithmLibArtifact.abi,
      linkBytecode(LogarithmLibArtifact, { FixidityLib: fixidity.address, })
    )
    const logarithm = await LogarithmLib.deploy()
    await logarithm.deployed()

    const ExponentLibArtifact = await readArtifact(config.paths.artifacts, 'ExponentLib')
    const ExponentLib = await ethers.getContractFactory(
      ExponentLibArtifact.abi,
      linkBytecode(ExponentLibArtifact, { FixidityLib: fixidity.address, LogarithmLib: logarithm.address })
    )
    const exponent = await ExponentLib.deploy()
    await exponent.deployed()

    const libraries = {
      FixidityLib: fixidity.address,
      LogarithmLib: logarithm.address,
      ExponentLib: exponent.address,
    }

    const BlackScholesArtifact = await readArtifact(config.paths.artifacts, 'BlackScholes')
    BlackScholes = await ethers.getContractFactory(
      BlackScholesArtifact.abi,
      linkBytecode(BlackScholesArtifact, libraries)
    )
  })

  beforeEach(async () => {
    bs = await BlackScholes.deploy()
  })

  scenarios.forEach(scenario => {
    it('returns the put price', async () => {
      const putPrice = await bs.getPutPrice(
        scenario.spotPrice,
        scenario.strikePrice,
        scenario.sigma,
        scenario.riskFree,
        scenario.daysRemaining
      )

      expect(putPrice).to.equal(scenario.expectedPutPrice)
    })
  })
})

function linkBytecode (artifact, libraries) {
  let bytecode = artifact.bytecode

  for (const [fileName, fileReferences] of Object.entries(
    artifact.linkReferences
  )) {
    for (const [libName, fixups] of Object.entries(fileReferences)) {
      const addr = libraries[libName]
      if (addr === undefined) {
        continue
      }

      for (const fixup of fixups) {
        bytecode =
          bytecode.substr(0, 2 + fixup.start * 2) +
          addr.substr(2) +
          bytecode.substr(2 + (fixup.start + fixup.length) * 2)
      }
    }
  }

  return bytecode
}
