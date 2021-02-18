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
    const result = await nd.getProbability('2839918236000000000000000', 24)
    expect(result).to.equal(ethers.BigNumber.from('997700000000000000000000'))
  })

  it('gets negative normal distribution', async () => {
    const result = await nd.getProbability('-2839918236000000000000000', 24)
    expect(result).to.equal(
      ethers.BigNumber.from('1000000000000000000000000').sub('997700000000000000000000')
    )
  })

  it('gets concentrated probabilities', async () => {
    expect(
      await nd.getProbability('3080000000000000000000000', 24)
    ).to.equal(ethers.BigNumber.from('999000000000000000000000'))

    expect(
      await nd.getProbability('3110000000000000000000000', 24)
    ).to.equal(ethers.BigNumber.from('999100000000000000000000'))

    expect(
      await nd.getProbability('3140000000000000000000000', 24)
    ).to.equal(ethers.BigNumber.from('999200000000000000000000'))

    expect(
      await nd.getProbability('3180000000000000000000000', 24)
    ).to.equal(ethers.BigNumber.from('999300000000000000000000'))

    expect(
      await nd.getProbability('3220000000000000000000000', 24)
    ).to.equal(ethers.BigNumber.from('999400000000000000000000'))

    expect(
      await nd.getProbability('3270000000000000000000000', 24)
    ).to.equal(ethers.BigNumber.from('999500000000000000000000'))

    expect(
      await nd.getProbability('3330000000000000000000000', 24)
    ).to.equal(ethers.BigNumber.from('999600000000000000000000'))

    expect(
      await nd.getProbability('3400000000000000000000000', 24)
    ).to.equal(ethers.BigNumber.from('999700000000000000000000'))

    expect(
      await nd.getProbability('3490000000000000000000000', 24)
    ).to.equal(ethers.BigNumber.from('999800000000000000000000'))

    expect(
      await nd.getProbability('3630000000000000000000000', 24)
    ).to.equal(ethers.BigNumber.from('999900000000000000000000'))
  })
})
