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
    let userC
    let userCAddress
    let user00
    let user00Address
    let user01
    let user01Address
    let user02
    let user02Address

    before(async function () {
      let MockERC20
      [userA, userB, userC, user00, user01, user02] = await ethers.getSigners()
      userAAddress = await userA.getAddress()
      userBAddress = await userB.getAddress()
      userCAddress = await userB.getAddress()
      user00Address = await user00.getAddress()
      user01Address = await user01.getAddress()
      user02Address = await user02.getAddress()

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
      it('should remove liquidity completely', async () => {
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
          },
          {
            name: 'removeLiquidity',
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

        expect(balanceAfterPoolTokenA).to.equal(toBigNumber(0))
        expect(balanceAfterPoolTokenB).to.equal(toBigNumber(0))

        expect(balanceAfterUserATokenA).to.equal(amountTokenAToMint)
        expect(balanceAfterUserATokenB).to.equal(amountTokenBToMint)
      })
    })

    describe('Scneario group APR - Add Liquidity / Price changes / Remove Liquidity', () => {
      it('should match balances accordingly - 3 adds / 1 price change / 3 remove unorder', async () => {
        const amountOfTokenAUser00 = await toBigNumber(50).mul(toBigNumber(10 ** scenario.tokenADecimals))
        const amountOfTokenBUser00 = await toBigNumber(3000).mul(toBigNumber(10 ** scenario.tokenBDecimals))

        const amountOfTokenAUser01 = await toBigNumber(100).mul(toBigNumber(10 ** scenario.tokenADecimals))

        const amountOfTokenBUser02 = await toBigNumber(4000).mul(toBigNumber(10 ** scenario.tokenBDecimals))

        const tokenPrice00 = await toBigNumber(400).mul(toBigNumber(10 ** scenario.tokenADecimals)).div(toBigNumber(10 ** scenario.tokenBDecimals))

        // tokenA x price = tokenB

        const actions = [
          {
            name: 'mint',
            contract: mockTokenA,
            user: user00,
            params: [amountOfTokenAUser00]
          },
          {
            name: 'mint',
            contract: mockTokenB,
            user: user00,
            params: [amountOfTokenBUser00]
          },
          {
            name: 'mint',
            contract: mockTokenA,
            user: user01,
            params: [amountOfTokenAUser01]
          },
          {
            name: 'mint',
            contract: mockTokenB,
            user: user02,
            params: [amountOfTokenBUser02]
          },
          {
            name: 'approve',
            contract: mockTokenA,
            user: user00,
            params: [amm.address, amountOfTokenAUser00]
          },
          {
            name: 'approve',
            contract: mockTokenB,
            user: user00,
            params: [amm.address, amountOfTokenBUser00]
          },
          {
            name: 'approve',
            contract: mockTokenA,
            user: user01,
            params: [amm.address, amountOfTokenAUser01]
          },
          {
            name: 'approve',
            contract: mockTokenB,
            user: user02,
            params: [amm.address, amountOfTokenBUser02]
          },
          {
            name: 'setPrice',
            contract: amm,
            user: user00,
            params: [tokenPrice00]
          },
          {
            name: 'addLiquidity',
            contract: amm,
            user: user00,
            params: [amountOfTokenAUser00, amountOfTokenBUser00]
          },
          {
            name: 'addLiquidity',
            contract: amm,
            user: user01,
            params: [amountOfTokenAUser01, 0]
          },
          {
            name: 'addLiquidity',
            contract: amm,
            user: user02,
            params: [0, amountOfTokenBUser02]
          },
          {
            name: 'removeLiquidity',
            contract: amm,
            user: user01,
            params: [amountOfTokenAUser01, 0]
          },
          {
            name: 'removeLiquidity',
            contract: amm,
            user: user00,
            params: [amountOfTokenAUser00, amountOfTokenBUser00]
          },
          {
            name: 'removeLiquidity',
            contract: amm,
            user: user02,
            params: [0, amountOfTokenBUser02]
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

        const balanceAfterUser00TokenA = await mockTokenA.balanceOf(user00Address)
        const balanceAfterUser00TokenB = await mockTokenB.balanceOf(user00Address)

        const balanceAfterUser01TokenA = await mockTokenA.balanceOf(user01Address)
        const balanceAfterUser01TokenB = await mockTokenB.balanceOf(user01Address)

        const balanceAfterUser02TokenA = await mockTokenA.balanceOf(user02Address)
        const balanceAfterUser02TokenB = await mockTokenB.balanceOf(user02Address)

        expect(balanceAfterPoolTokenA).to.equal(toBigNumber(0))
        expect(balanceAfterPoolTokenB).to.equal(toBigNumber(0))

        expect(balanceAfterUser00TokenA).to.equal(amountOfTokenAUser00)
        expect(balanceAfterUser00TokenB).to.equal(amountOfTokenBUser00)

        expect(balanceAfterUser01TokenA).to.equal(amountOfTokenAUser01)
        expect(balanceAfterUser01TokenB).to.equal(toBigNumber(0))

        expect(balanceAfterUser02TokenA).to.equal(toBigNumber(0))
        expect(balanceAfterUser02TokenB).to.equal(amountOfTokenBUser02)
      })
    })
    describe('Sell', () => {
    })
  })
})
