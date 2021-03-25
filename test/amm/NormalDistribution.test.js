const { expect } = require('chai')
const { ethers } = require('hardhat')

describe('NormalDistribution', () => {
  let NormalDistribution, nd

  before(async () => {
    NormalDistribution = await ethers.getContractFactory('NormalDistribution')
  })

  beforeEach(async () => {
    nd = await NormalDistribution.deploy()
  })

  it('fails when decimals is less than 4 and greater than 76', async () => {
    await expect(
      nd.getProbability('2839918236000000000000000', 3)
    ).to.be.revertedWith('NormalDistribution: invalid decimals')

    await expect(
      nd.getProbability('-2839918236000000000000000', 77)
    ).to.be.revertedWith('NormalDistribution: invalid decimals')
  })

  it('gets cached normal distribution', async () => {
    expect(
      await nd.getProbability('2839918236000000000000000', 24)
    ).to.equal(ethers.BigNumber.from('997740000000000000000000'))

    expect(
      await nd.getProbability('2836918236000000000000000', 24)
    ).to.equal(ethers.BigNumber.from('997700000000000000000000'))

    expect(
      await nd.getProbability('2831918236000000000000000', 24)
    ).to.equal(ethers.BigNumber.from('997670000000000000000000'))
  })

  it('gets negative normal distribution', async () => {
    const result = await nd.getProbability('-2839918236000000000000000', 24)
    expect(result).to.equal(
      ethers.BigNumber.from('1000000000000000000000000').sub('997740000000000000000000')
    )
  })

  it('sets a new data point in the ND curve', async () => {
    const tx = nd.setDataPoint(30800, 99910);

    await expect(tx)
      .to.emit(nd, 'DataPointSet')
      .withArgs(30800, 99910)

    expect(
      await nd.getProbability('3080000000000000000000000', 24)
    ).to.equal(ethers.BigNumber.from('999100000000000000000000'))
  })

  it('gets concentrated probabilities', async () => {
    expect(
      await nd.getProbability('4010000000000000000000000', 24)
    ).to.equal(ethers.BigNumber.from('999970000000000000000000'))

    expect(
      await nd.getProbability('4100000000000000000000000', 24)
    ).to.equal(ethers.BigNumber.from('999970000000000000000000'))

    expect(
      await nd.getProbability('4110000000000000000000000', 24)
    ).to.equal(ethers.BigNumber.from('999980000000000000000000'))

    expect(
      await nd.getProbability('4180000000000000000000000', 24)
    ).to.equal(ethers.BigNumber.from('999980000000000000000000'))

    expect(
      await nd.getProbability('4190000000000000000000000', 24)
    ).to.equal(ethers.BigNumber.from('999990000000000000000000'))
  })
})
