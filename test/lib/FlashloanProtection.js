const { ethers } = require('hardhat')
const { expect } = require('chai')
const { toBigNumber } = require('../../utils/utils')

describe('FlashloanProtection', () => {
  let reentrancySample, reentrancyAttacker

  before(async () => {
    const ReentrancySample = await ethers.getContractFactory('FlashloanSample')
    const ReentrancyAttacker = await ethers.getContractFactory('CombinedAttacker')

    reentrancySample = await ReentrancySample.deploy()
    reentrancyAttacker = await ReentrancyAttacker.deploy()

    await reentrancySample.deployed()
    await reentrancyAttacker.deployed()
  })

  it('Should revert if an origin try to call function one and two at same block.number from the same origin', async () => {
    await expect(reentrancyAttacker.zapper(reentrancySample.address)).to.be.revertedWith('FlashloanProtection: reentrant call')
  })

  it('Should allow if the user tries to execute the same transaction, but in a sequence of blocks', async () => {
    await reentrancyAttacker.oneProxy(reentrancySample.address)
    await reentrancyAttacker.oneProxy(reentrancySample.address)
    await reentrancyAttacker.twoProxy(reentrancySample.address)
    expect(await reentrancySample.interactions()).to.be.equal(3)
  })
})
