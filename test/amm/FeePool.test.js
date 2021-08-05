const { expect } = require('chai')
const { ethers } = require('hardhat')
const { toBigNumber } = require('../../utils/utils')
const createConfigurationManager = require('../util/createConfigurationManager')
const { takeSnapshot, revertToSnapshot } = require('../util/snapshot')

describe.only('FeePool', () => {
  let FeePool, pool
  let usdc
  let owner0, owner1, feePayer, poolOwner
  let owner0Address, owner1Address
  let configurationManager
  let snapshotId
  const baseFee = toBigNumber(10)
  const initialDecimals = toBigNumber(3)

  before(async () => {
    ;[owner0, owner1, feePayer, poolOwner, treasury] = await ethers.getSigners()
    ;[owner0Address, owner1Address] = await Promise.all([
      owner0.getAddress(),
      owner1.getAddress()
    ])

    configurationManager = await createConfigurationManager()

    await configurationManager.setParameter(
      ethers.utils.formatBytes32String('TREASURY_ADDRESS'),
      treasury.address
    )

    await configurationManager.setParameter(
      ethers.utils.formatBytes32String('TREASURY_FEE_RATE'),
      0
    )

    FeePool = await ethers.getContractFactory('FeePool')

    const USDC = await ethers.getContractFactory('MintableERC20')
    usdc = await USDC.deploy('USDC', 'USDC', 6)
    await usdc.deployed()
  })

  beforeEach(async () => {
    snapshotId = await takeSnapshot()
    pool = await FeePool.connect(poolOwner).deploy(configurationManager.address, usdc.address, baseFee, initialDecimals)
    await pool.deployed()
  })

  afterEach(async () => {
    await revertToSnapshot(snapshotId)
  })

  it('cannot charge more than 100% base fees', async () => {
    const decimals = await usdc.decimals()
    const tx = FeePool.connect(poolOwner).deploy(configurationManager.address, usdc.address, 10 ** decimals + 1, decimals)
    await expect(tx).to.be.revertedWith('FeePool: Invalid Fee data')
  })

  it('cannot create a pool with a zero-address token', async () => {
    const tx = FeePool.connect(poolOwner).deploy(configurationManager.address, ethers.constants.AddressZero, baseFee, initialDecimals)
    await expect(tx).to.be.revertedWith('FeePool: Invalid token')
  })

  describe('Fee parameters', () => {
    it('sets the contract with initial params', async () => {
      expect(await pool.feeValue()).to.equal(baseFee)
      expect(await pool.feeDecimals()).to.equal(initialDecimals)
    })

    it('updates the contract parameters', async () => {
      const newBaseFeeValue = toBigNumber(5)
      const newFeeDecimals = toBigNumber(1)
      const transaction = await pool.setFee(newBaseFeeValue, newFeeDecimals)

      await expect(transaction)
        .to.emit(pool, 'FeeUpdated')
        .withArgs(usdc.address, newBaseFeeValue, newFeeDecimals)

      expect(await pool.feeValue()).to.equal(newBaseFeeValue)
      expect(await pool.feeDecimals()).to.equal(newFeeDecimals)
    })

    it('cannot charge more than 100% base fees', async () => {
      const decimals = await usdc.decimals()
      const tx = pool.setFee(10 ** decimals + 1, decimals)
      await expect(tx).to.be.revertedWith('FeePool: Invalid Fee data')
    })
  })

  describe('Fee collection', () => {
    it('calculates the fee correctly - small trade (0 dynamic fee)', async () => {
      const newBaseFeeValue = toBigNumber(10)
      const newFeeDecimals = toBigNumber(3)

      await pool.setFee(newBaseFeeValue, newFeeDecimals)

      const amount = toBigNumber(800)
      const poolAmount = toBigNumber(10000)
      const expectedFees = toBigNumber(16)

      expect(await pool.getCollectable(amount, poolAmount)).to.equal(expectedFees)
    })

    it('calculates the fee correctly - big trade  (dynamic fee)', async () => {
      const newBaseFeeValue = toBigNumber(10)
      const newFeeDecimals = toBigNumber(3)

      await pool.setFee(newBaseFeeValue, newFeeDecimals)

      const amount = toBigNumber(4000)
      const poolAmount = toBigNumber(10000)
      const expectedFees = toBigNumber(40 + 5120)

      expect(await pool.getCollectable(amount, poolAmount)).to.equal(expectedFees)
    })
  })

  describe('Fee shares', () => {
    it('triggers the events when minting and withdrawing', async () => {
      const owner0Shares = toBigNumber(50)
      const mintTransaction = pool.connect(poolOwner).mint(owner0Address, owner0Shares)

      await expect(mintTransaction)
        .to.emit(pool, 'ShareMinted')
        .withArgs(usdc.address, owner0Address, owner0Shares)

      let totalFees = toBigNumber(0)

      const collectFrom = async amount => {
        const collection = toBigNumber(amount)
        const poolAmount = collection.mul(1000)
        const expectedFees = await pool.getCollectable(collection, poolAmount)
        await usdc.connect(feePayer).mint(expectedFees)
        await usdc.connect(feePayer).approve(pool.address, expectedFees)
        await usdc.connect(feePayer).transfer(pool.address, expectedFees)
        expect(await usdc.balanceOf(pool.address)).to.equal(totalFees.add(expectedFees))
        totalFees = totalFees.add(expectedFees)
      }

      // Collect some fees
      await collectFrom(100 * 1e18)
      await collectFrom(50 * 1e18)
      await collectFrom(43.333 * 1e18)

      const withdrawTransaction = pool.connect(poolOwner).withdraw(owner0Address, owner0Shares)

      await expect(withdrawTransaction)
        .to.emit(pool, 'FeeWithdrawn')
        .withArgs(usdc.address, owner0Address, totalFees, owner0Shares)
    })

    it('should be able to withdraw all fees if its the only share owner', async () => {
      const owner0Shares = toBigNumber(50)
      await pool.connect(poolOwner).mint(owner0Address, owner0Shares)
      const owner0Balance = await pool.balanceOf(owner0Address)
      expect(owner0Balance.shares).to.equal(owner0Shares)
      expect(owner0Balance.shares).to.equal(await pool.totalShares())
      expect(owner0Balance.liability).to.equal(0)

      let totalFees = toBigNumber(0)

      const collectFrom = async amount => {
        const collection = toBigNumber(amount)
        const poolAmount = collection.mul(1000)
        const expectedFees = await pool.getCollectable(collection, poolAmount)
        await usdc.connect(feePayer).mint(expectedFees)
        await usdc.connect(feePayer).approve(pool.address, expectedFees)
        await usdc.connect(feePayer).transfer(pool.address, expectedFees)
        expect(await usdc.balanceOf(pool.address)).to.equal(totalFees.add(expectedFees))
        totalFees = totalFees.add(expectedFees)
      }

      // Collect some fees
      await collectFrom(100 * 1e18)
      await collectFrom(50 * 1e18)
      await collectFrom(43.333 * 1e18)

      // Withdraws all collected fees
      await pool.connect(poolOwner).withdraw(owner0Address, owner0Shares)
      expect(await usdc.balanceOf(owner0Address)).to.equal(totalFees)
      expect(await usdc.balanceOf(pool.address)).to.equal(0)
    })

    it('should mint shares proportionally to their participation', async () => {
      // Owner 0 enters the pool
      const owner0Shares = toBigNumber(50)
      await pool.connect(poolOwner).mint(owner0Address, owner0Shares)
      const owner0Balance = await pool.balanceOf(owner0Address)
      expect(owner0Balance.shares).to.equal(owner0Shares)
      expect(owner0Balance.liability).to.equal(0)

      let totalFees = toBigNumber(0)

      const collectFrom = async amount => {
        const collection = toBigNumber(amount)
        const poolAmount = collection.mul(1000)
        const expectedFees = await pool.getCollectable(collection, poolAmount)
        await usdc.connect(feePayer).mint(expectedFees)
        await usdc.connect(feePayer).approve(pool.address, expectedFees)
        await usdc.connect(feePayer).transfer(pool.address, expectedFees)
        expect(await usdc.balanceOf(pool.address)).to.equal(totalFees.add(expectedFees))
        totalFees = totalFees.add(expectedFees)
      }

      // Collect some fees
      await collectFrom(100 * 1e18)
      await collectFrom(50 * 1e18)

      // Owner 1 enters the pool after some fees were collected,
      // therefore being eligible to withdraw fees proportionally from now onwards
      const owner1Shares = toBigNumber(50)
      await pool.connect(poolOwner).mint(owner1Address, owner1Shares)
      const owner1Balance = await pool.balanceOf(owner1Address)
      expect(owner1Balance.shares).to.equal(owner1Shares)
      expect(owner1Balance.liability).to.equal(totalFees)

      await collectFrom(400 * 1e18)

      // Owner 0 withdraws
      const amount = toBigNumber((100 + 50 + (400 / 2)) * 1e18)
      const poolAmount = amount.mul(10000)
      const owner0Withdrawal = await pool.getCollectable(amount, poolAmount)
      await pool.connect(poolOwner).withdraw(owner0Address, owner0Shares)
      expect(await usdc.balanceOf(owner0Address)).to.equal(owner0Withdrawal)
      expect(await usdc.balanceOf(pool.address)).to.equal(totalFees.sub(owner0Withdrawal))

      // Owner 1 withdraws
      const owner1Withdrawal = totalFees.sub(owner0Withdrawal)
      await pool.connect(poolOwner).withdraw(owner1Address, owner1Shares)
      expect(await usdc.balanceOf(owner1Address)).to.equal(owner1Withdrawal)
      expect(await usdc.balanceOf(pool.address)).to.equal(0)
    })

    it('should not allow to withdraw without enough share balance', async () => {
      const owner0Shares = toBigNumber(50)
      const moreThanOwned = toBigNumber(100)
      await pool.connect(poolOwner).mint(owner0Address, owner0Shares)
      const moreThanOwnedTransaction = pool.connect(poolOwner).withdraw(owner0Address, moreThanOwned)

      await expect(moreThanOwnedTransaction)
        .to.be.revertedWith('Burn exceeds balance')

      const neverMintedShares = toBigNumber(100)
      const neverMintedTransaction = pool.connect(poolOwner).withdraw(owner1Address, neverMintedShares)

      await expect(neverMintedTransaction)
        .to.be.revertedWith('Burn exceeds balance')
    })
  })

  describe('Treasury', () => {
    it.only('allow treasury to withdraw fees', async () => {
      // await configurationManager.setParameter(
      //   ethers.utils.formatBytes32String('TREASURY_FEE_RATE'),
      //   970
      // )
      //
      // const owner0Shares = toBigNumber(50)
      // await pool.connect(poolOwner).mint(owner0Address, owner0Shares)
      // const owner0Balance = await pool.balanceOf(owner0Address)
      // expect(owner0Balance.shares).to.equal(owner0Shares)
      // expect(owner0Balance.shares).to.equal(await pool.totalShares())
      // expect(owner0Balance.liability).to.equal(0)

      // let totalFees = toBigNumber(0)
      //
      // const collectFrom = async amount => {
      //   const collection = toBigNumber(amount)
      //   const poolAmount = collection.mul(1000)
      //   const expectedFees = await pool.getCollectable(collection, poolAmount)
      //   await usdc.connect(feePayer).mint(expectedFees)
      //   await usdc.connect(feePayer).approve(pool.address, expectedFees)
      //   await usdc.connect(feePayer).transfer(pool.address, expectedFees)
      //   expect(await usdc.balanceOf(pool.address)).to.equal(totalFees.add(expectedFees))
      //   totalFees = totalFees.add(expectedFees)
      // }
      //
      // // Collect some fees
      // await collectFrom(100 * 1e18)
      // await collectFrom(50 * 1e18)
      // await collectFrom(43.333 * 1e18)
      //
      // // Withdraws all collected fees
      // await pool.connect(poolOwner).withdraw(owner0Address, owner0Shares)
      // const a = await pool.balanceOf(treasury.address)
      // // console.log(a.shares.toString())
      // // await pool.connect(treasury).withdrawTreasury()
      // expect(await usdc.balanceOf(owner0Address)).to.equal(totalFees)
      // expect(await usdc.balanceOf(pool.address)).to.equal(0)
    })

    it('blocks others to withdraw treasury fees', async () => {
      const tx = pool.withdrawTreasury()
      expect(tx).to.be.revertedWith('FeePool: caller is not treasury')
    })
  })
})
