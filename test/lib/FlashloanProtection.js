const { ethers } = require('hardhat')
const { expect } = require('chai')
const { toBigNumber } = require('../../utils/utils')

describe('CombinedActions', () => {
  let combinedSample, combinedAttacker

  before(async () => {
    const CombinedSample = await ethers.getContractFactory('FlashloanSample')
    const CombinedAttacker = await ethers.getContractFactory('CombinedAttacker')

    combinedSample = await CombinedSample.deploy()
    combinedAttacker = await CombinedAttacker.deploy()

    await combinedSample.deployed()
    await combinedAttacker.deployed()
  })

  it('Should revert if an origin try to call function one and two at same block.number from the same origin', async () => {
    await expect(combinedAttacker.zapper(combinedSample.address)).to.be.revertedWith('CombinedActionsGuard: reentrant call')
  })

  it('Should allow if the user tries to execute the same transaction, but in a sequence of blocks', async () => {
    await combinedAttacker.oneProxy(combinedSample.address)
    await combinedAttacker.oneProxy(combinedSample.address)
    await combinedAttacker.twoProxy(combinedSample.address)
    expect(await combinedSample.interactions()).to.be.equal(3)
  })
})
