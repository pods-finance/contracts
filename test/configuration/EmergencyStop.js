const { ethers } = require('hardhat')
const { expect } = require('chai')

describe('EmergencyStop', () => {
  let EmergencyStop, emergencyStop

  before(async () => {
    EmergencyStop = await ethers.getContractFactory('EmergencyStop')
  })

  beforeEach(async () => {
    emergencyStop = await EmergencyStop.deploy()
  })

  it('should return false to contracts that were not stopped', async () => {
    const target = ethers.constants.AddressZero

    expect(await emergencyStop.isStopped(target))
      .to.be.equal(false)
  })

  it('signals the stoppage of contracts', async () => {
    const target = ethers.constants.AddressZero

    await expect(emergencyStop.stop(target))
      .to.emit(emergencyStop, 'Stopped')
      .withArgs(target)

    expect(await emergencyStop.isStopped(target)).to.be.equal(true)
  })

  it('cannot resume not previously stopped contracts', async () => {
    const target = ethers.constants.AddressZero

    await expect(emergencyStop.resume(target))
      .to.be.revertedWith('EmergencyStop: target is not stopped')
  })

  it('signals the resume of contracts', async () => {
    const target = ethers.constants.AddressZero

    await emergencyStop.stop(target)
    expect(await emergencyStop.isStopped(target)).to.be.equal(true)

    await expect(emergencyStop.resume(target))
      .to.emit(emergencyStop, 'Resumed')
      .withArgs(target)

    expect(await emergencyStop.isStopped(target)).to.be.equal(false)
  })
})
