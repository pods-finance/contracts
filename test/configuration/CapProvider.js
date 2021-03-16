const { ethers } = require('hardhat')
const { expect } = require('chai')

describe('CapProvider', () => {
  let CapProvider, capProvider

  before(async () => {
    CapProvider = await ethers.getContractFactory('CapProvider')
  })

  beforeEach(async () => {
    capProvider = await CapProvider.deploy()
  })

  it('should not set cap for zero address', async () => {
    const target = ethers.constants.AddressZero
    const capValue = ethers.BigNumber.from(100)

    await expect(capProvider.setCap(target, capValue))
      .to.be.revertedWith('CapProvider: Invalid target')
  })
})
