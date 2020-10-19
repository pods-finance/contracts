const { expect } = require('chai')
const { toBigNumber } = require('../../utils/utils')

describe.only('FeePool', () => {
  let FeePool, pool
  let usdc
  let user
  const initialFee = toBigNumber(997)
  const initialDecimals = toBigNumber(3)

  before(async () => {
    [user] = await ethers.getSigners()
    FeePool = await ethers.getContractFactory('FeePool')

    const USDC = await ethers.getContractFactory('MintableERC20')
    usdc = await USDC.deploy('USDC', 'USDC', 6)
    await usdc.deployed()
  })

  beforeEach(async () => {
    pool = await FeePool.deploy(usdc.address, initialFee, initialDecimals)
    await pool.deployed()
  })

  it('sets the contract with initial params', async () => {
    expect(await pool.getFeeValue()).to.equal(initialFee)
    expect(await pool.getFeeDecimals()).to.equal(initialDecimals)
  })

  it('updates the params', async () => {
    const newFeeValue = toBigNumber(5)
    const newFeeDecimals = toBigNumber(1)
    const transaction = pool.setFee(newFeeValue, newFeeDecimals)

    await expect(transaction)
      .to.emit(pool, 'FeeUpdated')
      .withArgs(usdc.address, newFeeValue, newFeeDecimals)

    expect(await pool.getFeeValue()).to.equal(newFeeValue)
    expect(await pool.getFeeDecimals()).to.equal(newFeeDecimals)
  })

  it('calculates the fee correctly', async () => {
    const amount = toBigNumber(1e18)
    const expectedFees = toBigNumber(0.003 * 1e18)

    expect(await pool.getCollectable(amount)).to.equal(expectedFees)
  })

  it('collects the due amount in fees', async () => {
    const feeAmount = toBigNumber(1e18)

    await usdc.connect(user).mint(feeAmount)
    await usdc.connect(user).approve(pool.address, feeAmount)
    const transaction = pool.collect(feeAmount)

    await expect(transaction)
      .to.emit(pool, 'FeeCollected')
      .withArgs(usdc.address, feeAmount)

    expect(await usdc.balanceOf(await user.getAddress())).to.equal(0)
    expect(await usdc.balanceOf(pool.address)).to.equal(feeAmount)
  })

  it('withdraws the collected fees', async () => {
    const userAddress = await user.getAddress()
    let amountToWithdraw = toBigNumber(0)

    const deposit = async value => {
      const amount = toBigNumber(value)
      await usdc.connect(user).mint(amount)
      await usdc.connect(user).approve(pool.address, amount)
      await pool.collect(amount)
      amountToWithdraw = amountToWithdraw.add(amount)
    }

    await deposit(1e18)
    await deposit(2 * 1e18)
    await deposit(10.542 * 1e18)

    expect(await usdc.balanceOf(userAddress)).to.equal(0)

    const transaction = pool.withdraw(amountToWithdraw, userAddress)

    await expect(transaction)
      .to.emit(pool, 'FeeWithdrawn')
      .withArgs(usdc.address, amountToWithdraw, userAddress)

    expect(await usdc.balanceOf(userAddress)).to.equal(amountToWithdraw)
  })
})
