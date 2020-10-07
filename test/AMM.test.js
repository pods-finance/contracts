const { expect } = require('chai')
const BigNumber = require('bignumber.js')
const getTimestamp = require('./util/getTimestamp')
const { toBigNumber } = require('../utils/utils')

const OPTION_TYPE_PUT = 0

const scenarios = [
  {
    name: 'TKN-A/TKN-B',
    tokenASymbol: 'TKN-A',
    tokenADecimals: 8,
    tokenBSymbol: 'TKN-B',
    tokenBDecimals: 6
  }
]

scenarios.forEach(scenario => {
  describe('AMM.sol - ' + scenario.name, () => {
    const TEN = ethers.BigNumber.from('10')
    let mockTokenA
    let mockTokenB
    let amm
    let userA
    let userAAddress
    let userB
    let userBAddress

    before(async function () {
      let MockERC20
      [userA, userB] = await ethers.getSigners()
      userAAddress = await userA.getAddress()
      userBAddress = await userB.getAddress()

      // 1) Deploy Option
      // 2) Use same strike Asset
      ;[MockERC20] = await Promise.all([
        ethers.getContractFactory('MintableERC20')
      ])

      ;[mockTokenA, mockTokenB] = await Promise.all([
        MockERC20.deploy(scenario.tokenASymbol, scenario.tokenASymbol, scenario.tokenADecimals),
        MockERC20.deploy(scenario.tokenBSymbol, scenario.tokenBSymbol, scenario.tokenBDecimals)
      ])

      mockTokenA.deployed()
      mockTokenB.deployed()
    })

    beforeEach(async function () {
      // 1) Deploy OptionAMM
      const MockAMM = await ethers.getContractFactory('MockAMM')
      amm = await MockAMM.deploy(mockTokenA.address, mockTokenB.address)

      await amm.deployed()
    })

    describe('Constructor/Initialization checks', () => {
      it('should have correct initial parameters', async () => {
        expect(await amm.tokenA()).to.equal(mockTokenA.address)
        expect(await amm.tokenB()).to.equal(mockTokenB.address)
      })
    })

    describe('Add Liquidity', () => {
      it('should revert if user dont supply liquidity of both assets', async () => {
        await expect(amm.addLiquidity(0, 10000)).to.be.revertedWith('You should add both tokens on the first liquidity')

        await expect(amm.addLiquidity(100000, 0)).to.be.revertedWith('You should add both tokens on the first liquidity')

        await expect(amm.addLiquidity(0, 0)).to.be.revertedWith('You should add both tokens on the first liquidity')
      })

      it('should revert if user ask more assets than the user s balance', async () => {
        await expect(amm.addLiquidity(1000, 10000)).to.be.revertedWith('ERC20: transfer amount exceeds balance')
      })

      it('should match balances accordingly', async () => {
        const amountTokenAToMint = await toBigNumber(1).mul(toBigNumber(10 ** scenario.tokenADecimals))
        const amountTokenBToMint = await toBigNumber(1).mul(toBigNumber(10 ** scenario.tokenBDecimals))

        const actions = [
          {
            name: 'mint',
            contract: mockTokenA,
            user: userA,
            params: [amountTokenAToMint]
          },
          {
            name: 'mint',
            contract: mockTokenB,
            user: userA,
            params: [amountTokenBToMint]
          },
          {
            name: 'approve',
            contract: mockTokenA,
            user: userA,
            params: [amm.address, amountTokenAToMint]
          },
          {
            name: 'approve',
            contract: mockTokenB,
            user: userA,
            params: [amm.address, amountTokenBToMint]
          },
          {
            name: 'addLiquidity',
            contract: amm,
            user: userA,
            params: [amountTokenAToMint, amountTokenBToMint]
          }

        ]

        const fnActions = actions.map(action => {
          const fn = async () => action.contract.connect(action.user)[action.name](...action.params)
          return fn
        })

        for (const fn of fnActions) {
          await fn()
        }

        const balanceAfterPoolTokenA = await mockTokenA.balanceOf(amm.address)
        const balanceAfterPoolTokenB = await mockTokenB.balanceOf(amm.address)

        const balanceAfterUserATokenA = await mockTokenA.balanceOf(userAAddress)
        const balanceAfterUserATokenB = await mockTokenB.balanceOf(userAAddress)

        expect(balanceAfterPoolTokenA).to.equal(amountTokenAToMint)
        expect(balanceAfterPoolTokenB).to.equal(amountTokenBToMint)
        expect(balanceAfterUserATokenA).to.equal(toBigNumber(0))
        expect(balanceAfterUserATokenB).to.equal(toBigNumber(0))
      })
    })

    describe('Remove Liquidity', () => {
      // it('should remove liquidity completely', async () => {
      //   const amountTokenAToMint = await toBigNumber(1).mul(toBigNumber(10 ** scenario.tokenADecimals))
      //   const amountTokenBToMint = await toBigNumber(1).mul(toBigNumber(10 ** scenario.tokenBDecimals))

      //   const actions = [
      //     {
      //       name: 'mint',
      //       contract: mockTokenA,
      //       user: userA,
      //       params: [amountTokenAToMint]
      //     },
      //     {
      //       name: 'mint',
      //       contract: mockTokenB,
      //       user: userA,
      //       params: [amountTokenBToMint]
      //     },
      //     {
      //       name: 'approve',
      //       contract: mockTokenA,
      //       user: userA,
      //       params: [amm.address, amountTokenAToMint]
      //     },
      //     {
      //       name: 'approve',
      //       contract: mockTokenB,
      //       user: userA,
      //       params: [amm.address, amountTokenBToMint]
      //     },
      //     {
      //       name: 'addLiquidity',
      //       contract: amm,
      //       user: userA,
      //       params: [amountTokenAToMint, amountTokenBToMint]
      //     },
      //     {
      //       name: 'removeLiquidity',
      //       contract: amm,
      //       user: userA,
      //       params: [amountTokenAToMint, amountTokenBToMint]
      //     }

      //   ]

      //   const fnActions = actions.map(action => {
      //     const fn = async () => action.contract.connect(action.user)[action.name](...action.params)
      //     return fn
      //   })

      //   for (const fn of fnActions) {
      //     await fn()
      //   }

      //   const balanceAfterPoolTokenA = await mockTokenA.balanceOf(amm.address)
      //   const balanceAfterPoolTokenB = await mockTokenB.balanceOf(amm.address)

      //   const balanceAfterUserATokenA = await mockTokenA.balanceOf(userAAddress)
      //   const balanceAfterUserATokenB = await mockTokenB.balanceOf(userAAddress)

      //   expect(balanceAfterPoolTokenA).to.equal(toBigNumber(0))
      //   expect(balanceAfterPoolTokenB).to.equal(toBigNumber(0))

      //   expect(balanceAfterUserATokenA).to.equal(amountTokenAToMint)
      //   expect(balanceAfterUserATokenB).to.equal(amountTokenBToMint)
      // })
    })

    describe('Buy', () => {

    })
    describe('Sell', () => {
    })
  })
})
