const { ethers } = require('hardhat')
const { expect } = require('chai')
const getTimestamp = require('../util/getTimestamp')

describe('IVProvider', () => {
  let IVProvider, provider, admin, updater, unsettedUpdater

  before(async () => {
    ;[admin, updater, unsettedUpdater] = await ethers.getSigners()
    IVProvider = await ethers.getContractFactory('IVProvider')
  })

  beforeEach(async () => {
    provider = await IVProvider.connect(admin).deploy()
  })

  it('shows the current IV', async () => {
    const timestamp = await getTimestamp()
    const option = ethers.constants.AddressZero
    await provider.connect(admin).setUpdater(updater.address)
    await provider.connect(updater).updateIV(option, 130e8, 8)

    const firstIVData = await provider.getIV(option)
    expect(firstIVData[0]).to.be.equal(1)
    expect(firstIVData[1].toNumber() >= timestamp).to.be.true
    expect(firstIVData[2]).to.be.equal(130e8)
    expect(firstIVData[3]).to.be.equal(8)

    // skips 3 minutes
    await ethers.provider.send('evm_mine', [timestamp + 180])

    await provider.connect(updater).updateIV(option, 200e8, 8)

    const secondIVData = await provider.getIV(option)
    expect(secondIVData[0]).to.be.equal(2)
    expect(secondIVData[1].toNumber() >= firstIVData[1].toNumber()).to.be.true
  })

  describe('Role management', () => {
    it('assigns the updater Role', async () => {
      const tx = provider.connect(admin).setUpdater(updater.address)

      await expect(tx)
        .to.emit(provider, 'UpdaterSet')
        .withArgs(admin.address, updater.address)
    })

    it('fails to update when the user is not an updater', async () => {
      const tx = provider.connect(unsettedUpdater).updateIV(ethers.constants.AddressZero, 1000e8, 8)

      await expect(tx)
        .to.be.revertedWith('IVProvider: sender must be an updater')
    })
  })
})
