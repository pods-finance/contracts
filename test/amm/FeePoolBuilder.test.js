const { expect } = require('chai')
const { ethers } = require('hardhat')
const { toBigNumber } = require('../../utils/utils')

describe('FeePoolBuilder', () => {
  let FeePoolBuilder, MintableERC20
  let feePoolBuilder, usdc
  let deployer, owner
  const baseFee = toBigNumber(3)
  const dynamicFee = toBigNumber(3)
  const initialDecimals = toBigNumber(3)

  before(async () => {
    ;[deployer, owner] = await ethers.getSigners()
    ;[FeePoolBuilder, MintableERC20] = await Promise.all([
      ethers.getContractFactory('FeePoolBuilder'),
      ethers.getContractFactory('MintableERC20')
    ])

    usdc = await MintableERC20.deploy('USDC Token', 'USDC', 6)
  })

  beforeEach(async () => {
    feePoolBuilder = await FeePoolBuilder.deploy()
  })

  it('should create a new FeePool correctly and not revert', async () => {
    // Calculates address
    const deterministicFeePoolAddress = await feePoolBuilder.callStatic.buildFeePool(
      usdc.address,
      baseFee,
      dynamicFee,
      initialDecimals,
      owner.address
    )

    // Executes the transaction
    const tx = feePoolBuilder.buildFeePool(usdc.address, baseFee, dynamicFee, initialDecimals, owner.address)
    await expect(tx).to.not.be.reverted

    const feePool = await ethers.getContractAt('FeePool', deterministicFeePoolAddress)
    expect(await feePool.owner()).to.be.equal(owner.address)
    expect(await feePool.feeToken()).to.be.equal(usdc.address)
    expect(await feePool.feeDecimals()).to.be.equal(initialDecimals)
    const feeValue = await feePool.feeValue()
    expect(feeValue.feeBaseValue).to.be.equal(baseFee)
    expect(feeValue.feeDynamicValue).to.be.equal(dynamicFee)
  })
})
