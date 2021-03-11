const { expect } = require('chai')
const { toBigNumber, approximately } = require('../../utils/utils')

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
    let mockTokenA
    let tokenADecimals
    let mockTokenB
    let tokenBDecimals
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
    let user03
    let user03Address

    // returns tokenAInstance, tokenBInstance, AMMInstance
    async function deployScenario () {
      const MockERC20 = await ethers.getContractFactory('MintableERC20')

      const [mockTokenA, mockTokenB] = await Promise.all([
        MockERC20.deploy(scenario.tokenASymbol, scenario.tokenASymbol, scenario.tokenADecimals),
        MockERC20.deploy(scenario.tokenBSymbol, scenario.tokenBSymbol, scenario.tokenBDecimals)
      ])

      mockTokenA.deployed()
      mockTokenB.deployed()
      // 1) Deploy OptionAMM
      const MockAMM = await ethers.getContractFactory('MockAMM')
      const amm = await MockAMM.deploy(mockTokenA.address, mockTokenB.address)

      await amm.deployed()

      return [mockTokenA, mockTokenB, amm]
    }

    beforeEach(async function () {
      let MockERC20
      [userA, userB, userC, user00, user01, user02, user03] = await ethers.getSigners()
      userAAddress = await userA.getAddress()
      userBAddress = await userB.getAddress()
      userCAddress = await userB.getAddress()
      user00Address = await user00.getAddress()
      user01Address = await user01.getAddress()
      user02Address = await user02.getAddress()
      user03Address = await user03.getAddress()

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

      tokenADecimals = await mockTokenA.decimals()
      tokenBDecimals = await mockTokenB.decimals()
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

      it('should not allow tokens with 0x0 address', async () => {
        const MockAMM = await ethers.getContractFactory('MockAMM')

        amm = MockAMM.deploy(userAAddress, mockTokenB.address)
        await expect(amm).to.revertedWith('AMM: token a is not a contract')

        amm = MockAMM.deploy(mockTokenA.address, userAAddress)
        await expect(amm).to.revertedWith('AMM: token b is not a contract')
      })

      it('should not allow tokens that are not contracts', async () => {
        const MockAMM = await ethers.getContractFactory('MockAMM')

        amm = MockAMM.deploy(ethers.constants.AddressZero, mockTokenB.address)
        await expect(amm).to.revertedWith('AMM: token a is not a contract')

        amm = MockAMM.deploy(mockTokenA.address, ethers.constants.AddressZero)
        await expect(amm).to.revertedWith('AMM: token b is not a contract')
      })

      it('should not allow the same token as tokenA and tokenB', async () => {
        const MockAMM = await ethers.getContractFactory('MockAMM')

        amm = MockAMM.deploy(mockTokenA.address, mockTokenA.address)
        await expect(amm).to.be.revertedWith('AMM: tokens must differ')
      })
    })

    describe('Add Liquidity', () => {
      it('should revert if user dont supply liquidity of both assets', async () => {
        await expect(amm.addLiquidity(0, 10000, userAAddress)).to.be.revertedWith('AMM: invalid first liquidity')

        await expect(amm.addLiquidity(100000, 0, userAAddress)).to.be.revertedWith('AMM: invalid first liquidity')

        await expect(amm.addLiquidity(0, 0, userAAddress)).to.be.revertedWith('AMM: invalid first liquidity')
      })

      it('should revert if user ask more assets than the users balance', async () => {
        await expect(
          amm.addLiquidity(1000, 10000, userAAddress)
        ).to.be.reverted
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
            params: [amountTokenAToMint, amountTokenBToMint, userAAddress]
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

        const userDepositSnapshot = await amm.getUserDepositSnapshot(userAAddress)
        expect(userDepositSnapshot.tokenAOriginalBalance).to.be.equal(amountTokenAToMint)
        expect(userDepositSnapshot.tokenBOriginalBalance).to.be.equal(amountTokenBToMint)

        expect(balanceAfterPoolTokenA).to.equal(amountTokenAToMint)
        expect(balanceAfterPoolTokenB).to.equal(amountTokenBToMint)
        expect(balanceAfterUserATokenA).to.equal(toBigNumber(0))
        expect(balanceAfterUserATokenB).to.equal(toBigNumber(0))
      })

      it('should not be able to add liquidity in zero-address behalf', async () => {
        const amountTokenAToMint = await toBigNumber(1).mul(toBigNumber(10 ** scenario.tokenADecimals))
        const amountTokenBToMint = await toBigNumber(1).mul(toBigNumber(10 ** scenario.tokenBDecimals))

        await mockTokenA.connect(userA).mint(amountTokenAToMint)
        await mockTokenA.connect(userA).approve(amm.address, amountTokenAToMint)

        await mockTokenB.connect(userA).mint(amountTokenBToMint)
        await mockTokenB.connect(userA).approve(amm.address, amountTokenBToMint)

        const tx = amm.connect(userA).addLiquidity(amountTokenAToMint, amountTokenBToMint, ethers.constants.AddressZero)

        await expect(tx).to.be.revertedWith('AMM: transfer to zero address')
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
            params: [amountTokenAToMint, amountTokenBToMint, userAAddress]
          },
          {
            name: 'removeLiquidity',
            contract: amm,
            user: userA,
            params: [100, 100]
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

      it('should remove liquidity completely even if some address sent tokens directly to the contract before the initial liquidity', async () => {
        const amountTokenAToMint = await toBigNumber(1).mul(toBigNumber(10 ** scenario.tokenADecimals))
        const amountTokenBToMint = await toBigNumber(1).mul(toBigNumber(10 ** scenario.tokenBDecimals))

        const amountTokenAToSendDirectly = amountTokenAToMint.mul(2)
        const amountTokenBToSendDirectly = amountTokenBToMint.mul(2)

        await mockTokenA.connect(userB).mint(amountTokenAToSendDirectly)
        await mockTokenA.connect(userB).transfer(amm.address, amountTokenAToSendDirectly)

        await mockTokenB.connect(userB).mint(amountTokenBToSendDirectly)
        await mockTokenB.connect(userB).transfer(amm.address, amountTokenBToSendDirectly)

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
            params: [amountTokenAToMint, amountTokenBToMint, userAAddress]
          },
          {
            name: 'removeLiquidity',
            contract: amm,
            user: userA,
            params: [100, 100]
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

        expect(balanceAfterUserATokenA).to.equal(amountTokenAToMint.add(amountTokenAToSendDirectly))
        expect(balanceAfterUserATokenB).to.equal(amountTokenBToMint.add(amountTokenBToSendDirectly))
      })

      it('should not remove liquidity when percentages dont match', async () => {
        // Adding liquidity
        await mockTokenA.connect(userB).mint(1e8)
        await mockTokenB.connect(userB).mint(1e8)
        await mockTokenA.connect(userB).approve(amm.address, 1e8)
        await mockTokenB.connect(userB).approve(amm.address, 1e8)
        await amm.connect(userB).addLiquidity(1e8, 1e8, userBAddress)

        await expect(amm.connect(userB).removeLiquidity(101, 100)).to.be.revertedWith('AMM: forbidden percent')
        await expect(amm.connect(userB).removeLiquidity(100, 101)).to.be.revertedWith('AMM: forbidden percent')
      })

      it('should show the position of users that did not add liquidity', async () => {
        let maxWithdrawAmountA, maxWithdrawAmountB
        // User A asking before there is any liquidity
        ;[maxWithdrawAmountA, maxWithdrawAmountB] = await amm.getMaxRemoveLiquidityAmounts(userAAddress)
        expect(maxWithdrawAmountA).to.equal(0)
        expect(maxWithdrawAmountB).to.equal(0)

        // Adding liquidity
        await mockTokenA.connect(userB).mint(1e8)
        await mockTokenB.connect(userB).mint(1e8)
        await mockTokenA.connect(userB).approve(amm.address, 1e8)
        await mockTokenB.connect(userB).approve(amm.address, 1e8)
        await amm.connect(userB).addLiquidity(1e8, 1e8, userBAddress)

        // User A asking after liquidity was added
        ;[maxWithdrawAmountA, maxWithdrawAmountB] = await amm.getMaxRemoveLiquidityAmounts(userAAddress)
        expect(maxWithdrawAmountA).to.equal(0)
        expect(maxWithdrawAmountB).to.equal(0)
      })
    })

    describe('Scenario group APR - Add Liquidity / Price change / Remove Liquidity', () => {
      it('should match balances accordingly - 3 adds / 1 price change / 3 remove un order', async () => {
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
            params: [amountOfTokenAUser00, amountOfTokenBUser00, user00Address]
          },
          {
            name: 'addLiquidity',
            contract: amm,
            user: user01,
            params: [amountOfTokenAUser01, 0, user01Address]
          },
          {
            name: 'addLiquidity',
            contract: amm,
            user: user02,
            params: [0, amountOfTokenBUser02, user02Address]
          },
          {
            name: 'removeLiquidity',
            contract: amm,
            user: user01,
            params: [100, 0]
          },
          {
            name: 'removeLiquidity',
            contract: amm,
            user: user00,
            params: [100, 100]
          },
          {
            name: 'removeLiquidity',
            contract: amm,
            user: user02,
            params: [0, 100]
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

      it('should match balances accordingly - 3 adds / 1 price change higher / 3 remove unorder', async () => {
        const amountOfTokenAUser00 = await toBigNumber(50).mul(toBigNumber(10 ** scenario.tokenADecimals))
        const amountOfTokenBUser00 = await toBigNumber(3000).mul(toBigNumber(10 ** scenario.tokenBDecimals))

        const amountOfTokenAUser01 = await toBigNumber(100).mul(toBigNumber(10 ** scenario.tokenADecimals))

        const amountOfTokenBUser02 = await toBigNumber(4000).mul(toBigNumber(10 ** scenario.tokenBDecimals))

        const tokenPrice00 = await toBigNumber(400).mul(toBigNumber(10 ** scenario.tokenADecimals)).div(toBigNumber(10 ** scenario.tokenBDecimals))

        const tokenPrice01 = await toBigNumber(500).mul(toBigNumber(10 ** scenario.tokenADecimals)).div(toBigNumber(10 ** scenario.tokenBDecimals))

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
            params: [amountOfTokenAUser00, amountOfTokenBUser00, user00Address]
          },
          {
            name: 'addLiquidity',
            contract: amm,
            user: user01,
            params: [amountOfTokenAUser01, 0, user01Address]
          },
          {
            name: 'addLiquidity',
            contract: amm,
            user: user02,
            params: [0, amountOfTokenBUser02, user02Address]
          },
          {
            name: 'setPrice',
            contract: amm,
            user: user00,
            params: [tokenPrice01]
          },
          {
            name: 'removeLiquidity',
            contract: amm,
            user: user01,
            params: [100, 0]
          },
          {
            name: 'removeLiquidity',
            contract: amm,
            user: user00,
            params: [100, 100]
          },
          {
            name: 'removeLiquidity',
            contract: amm,
            user: user02,
            params: [0, 100]
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

      it('should match balances accordingly - 3 adds / 1 price change lower / 3 remove un order', async () => {
        const amountOfTokenAUser00 = await toBigNumber(50).mul(toBigNumber(10 ** scenario.tokenADecimals))
        const amountOfTokenBUser00 = await toBigNumber(3000).mul(toBigNumber(10 ** scenario.tokenBDecimals))

        const amountOfTokenAUser01 = await toBigNumber(100).mul(toBigNumber(10 ** scenario.tokenADecimals))

        const amountOfTokenBUser02 = await toBigNumber(4000).mul(toBigNumber(10 ** scenario.tokenBDecimals))

        const tokenPrice00 = await toBigNumber(400).mul(toBigNumber(10 ** scenario.tokenADecimals)).div(toBigNumber(10 ** scenario.tokenBDecimals))

        const tokenPrice01 = await toBigNumber(300).mul(toBigNumber(10 ** scenario.tokenADecimals)).div(toBigNumber(10 ** scenario.tokenBDecimals))

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
            params: [amountOfTokenAUser00, amountOfTokenBUser00, user00Address]
          },
          {
            name: 'addLiquidity',
            contract: amm,
            user: user01,
            params: [amountOfTokenAUser01, 0, user01Address]
          },
          {
            name: 'setPrice',
            contract: amm,
            user: user00,
            params: [tokenPrice01]
          },
          {
            name: 'addLiquidity',
            contract: amm,
            user: user02,
            params: [0, amountOfTokenBUser02, user02Address]
          },
          {
            name: 'removeLiquidity',
            contract: amm,
            user: user01,
            params: [100, 0]
          },
          {
            name: 'removeLiquidity',
            contract: amm,
            user: user00,
            params: [100, 100]
          },
          {
            name: 'removeLiquidity',
            contract: amm,
            user: user02,
            params: [0, 100]
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

    describe('Scenario group ATR - Add Liquidity / Trade / Remove Liquidity', () => {
      it('should match balances accordingly - 3 adds / 1 trade(buy) / 3 remove un-order', async () => {
        const amountOfTokenAUser00 = toBigNumber(500).mul(toBigNumber(10 ** scenario.tokenADecimals))
        const amountOfTokenBUser00 = toBigNumber(3000).mul(toBigNumber(10 ** scenario.tokenBDecimals))

        const amountOfTokenAUser01 = toBigNumber(100).mul(toBigNumber(10 ** scenario.tokenADecimals))
        const amountOfTokenBUser01 = toBigNumber(0)

        const amountOfTokenAUser02 = toBigNumber(0)
        const amountOfTokenBUser02 = toBigNumber(4000).mul(toBigNumber(10 ** scenario.tokenBDecimals))

        const amountOfTokenAUser03Bought = toBigNumber(2).mul(toBigNumber(10 ** scenario.tokenADecimals))

        const tokenPrice00 = toBigNumber(400).mul(toBigNumber(10 ** scenario.tokenBDecimals))

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
            name: 'mint',
            contract: mockTokenA,
            user: user03,
            params: [amountOfTokenAUser03Bought]
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
            name: 'approve',
            contract: mockTokenA,
            user: user03,
            params: [amm.address, amountOfTokenAUser03Bought]
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
            params: [amountOfTokenAUser00, amountOfTokenBUser00, user00Address]
          },
          {
            name: 'addLiquidity',
            contract: amm,
            user: user01,
            params: [amountOfTokenAUser01, 0, user01Address]
          },
          {
            name: 'addLiquidity',
            contract: amm,
            user: user02,
            params: [0, amountOfTokenBUser02, user02Address]
          },
          {
            name: 'tradeExactAInput',
            contract: amm,
            user: user03,
            params: [amountOfTokenAUser03Bought, 0, user03Address]
          },
          {
            name: 'removeLiquidity',
            contract: amm,
            user: user01,
            params: [100, 0]
          },
          {
            name: 'removeLiquidity',
            contract: amm,
            user: user00,
            params: [100, 100]
          },
          {
            name: 'removeLiquidity',
            contract: amm,
            user: user02,
            params: [0, 100]
          }
        ]

        const fnActions = actions.map(action => {
          const fn = async () => action.contract.connect(action.user)[action.name](...action.params)
          return fn
        })

        for (const fn of fnActions) {
          await fn()
        }

        const balanceAfterTokenAPool = await mockTokenA.balanceOf(amm.address)
        const balanceAfterTokenBPool = await mockTokenB.balanceOf(amm.address)

        const balanceAfterTokenAUser00 = await mockTokenA.balanceOf(user00Address)
        const balanceAfterTokenBUser00 = await mockTokenB.balanceOf(user00Address)

        const balanceAfterTokenAUser01 = await mockTokenA.balanceOf(user01Address)
        const balanceAfterTokenBUser01 = await mockTokenB.balanceOf(user01Address)

        const balanceAfterTokenAUser02 = await mockTokenA.balanceOf(user02Address)
        const balanceAfterTokenBUser02 = await mockTokenB.balanceOf(user02Address)

        // price AB => units of B to buy 1 A =>
        const initialValueUser00inA = getValueInUnitsOfTokenA(amountOfTokenAUser00, amountOfTokenBUser00, tokenADecimals, tokenBDecimals, tokenPrice00)

        const finalValueUser00inA = getValueInUnitsOfTokenA(balanceAfterTokenAUser00, balanceAfterTokenBUser00, tokenADecimals, tokenBDecimals, tokenPrice00)

        const initialValueUser01inA = getValueInUnitsOfTokenA(amountOfTokenAUser01, amountOfTokenBUser01, tokenADecimals, tokenBDecimals, tokenPrice00)

        const finalValueUser01inA = getValueInUnitsOfTokenA(balanceAfterTokenAUser01, balanceAfterTokenBUser01, tokenADecimals, tokenBDecimals, tokenPrice00)

        const initialValueUser02inA = getValueInUnitsOfTokenA(amountOfTokenAUser02, amountOfTokenBUser02, tokenADecimals, tokenBDecimals, tokenPrice00)

        const finalValueUser02inA = getValueInUnitsOfTokenA(balanceAfterTokenAUser02, balanceAfterTokenBUser02, tokenADecimals, tokenBDecimals, tokenPrice00)

        expect(balanceAfterTokenAPool).to.equal(toBigNumber(0))
        expect(balanceAfterTokenBPool).to.equal(toBigNumber(0))

        expect(approximately(initialValueUser00inA, finalValueUser00inA, 1)).to.equal(true)
        expect(approximately(initialValueUser01inA, finalValueUser01inA, 1)).to.equal(true)
        expect(approximately(initialValueUser02inA, finalValueUser02inA, 1)).to.equal(true)
      })
      it('Sum of initial and final value should be equal - 3 adds / 1 trade(sell) / 3 remove un-order', async () => {
      //   const amountOfTokenAUser00 = toBigNumber(500).mul(toBigNumber(10 ** scenario.tokenADecimals))
      //   const amountOfTokenBUser00 = toBigNumber(3000).mul(toBigNumber(10 ** scenario.tokenBDecimals))

        //   const amountOfTokenAUser01 = toBigNumber(100).mul(toBigNumber(10 ** scenario.tokenADecimals))
        //   const amountOfTokenBUser01 = toBigNumber(0)

        //   const amountOfTokenAUser02 = toBigNumber(0)
        //   const amountOfTokenBUser02 = toBigNumber(4000).mul(toBigNumber(10 ** scenario.tokenBDecimals))

        //   const amountOfTokenAUser04Sell = toBigNumber(2).mul(toBigNumber(10 ** scenario.tokenADecimals))

        //   const tokenPrice00 = toBigNumber(400).mul(toBigNumber(10 ** scenario.tokenBDecimals))

        //   // tokenA x price = tokenB

        //   const actions = [
        //     {
        //       name: 'mint',
        //       contract: mockTokenA,
        //       user: user00,
        //       params: [amountOfTokenAUser00]
        //     },
        //     {
        //       name: 'mint',
        //       contract: mockTokenB,
        //       user: user00,
        //       params: [amountOfTokenBUser00]
        //     },
        //     {
        //       name: 'mint',
        //       contract: mockTokenA,
        //       user: user01,
        //       params: [amountOfTokenAUser01]
        //     },
        //     {
        //       name: 'mint',
        //       contract: mockTokenB,
        //       user: user02,
        //       params: [amountOfTokenBUser02]
        //     },
        //     {
        //       name: 'mint',
        //       contract: mockTokenA,
        //       user: user03,
        //       params: [amountOfTokenAUser04Sell]
        //     },
        //     {
        //       name: 'approve',
        //       contract: mockTokenA,
        //       user: user00,
        //       params: [amm.address, amountOfTokenAUser00]
        //     },
        //     {
        //       name: 'approve',
        //       contract: mockTokenB,
        //       user: user00,
        //       params: [amm.address, amountOfTokenBUser00]
        //     },
        //     {
        //       name: 'approve',
        //       contract: mockTokenA,
        //       user: user01,
        //       params: [amm.address, amountOfTokenAUser01]
        //     },
        //     {
        //       name: 'approve',
        //       contract: mockTokenB,
        //       user: user02,
        //       params: [amm.address, amountOfTokenBUser02]
        //     },
        //     {
        //       name: 'approve',
        //       contract: mockTokenA,
        //       user: user03,
        //       params: [amm.address, amountOfTokenAUser04Sell]
        //     },
        //     {
        //       name: 'setPrice',
        //       contract: amm,
        //       user: user00,
        //       params: [tokenPrice00]
        //     },
        //     {
        //       name: 'addLiquidity',
        //       contract: amm,
        //       user: user00,
        //       params: [amountOfTokenAUser00, amountOfTokenBUser00]
        //     },
        //     {
        //       name: 'addLiquidity',
        //       contract: amm,
        //       user: user01,
        //       params: [amountOfTokenAUser01, 0]
        //     },
        //     {
        //       name: 'addLiquidity',
        //       contract: amm,
        //       user: user02,
        //       params: [0, amountOfTokenBUser02]
        //     },
        //     {
        //       name: '_sellTokensWithExactTokens',
        //       contract: amm,
        //       user: user03,
        //       params: [amountOfTokenAUser04Sell, 0]
        //     },
        //     {
        //       name: 'removeLiquidity',
        //       contract: amm,
        //       user: user01,
        //       params: [amountOfTokenAUser01, 0]
        //     },
        //     {
        //       name: 'removeLiquidity',
        //       contract: amm,
        //       user: user00,
        //       params: [amountOfTokenAUser00, amountOfTokenBUser00]
        //     },
        //     {
        //       name: 'removeLiquidity',
        //       contract: amm,
        //       user: user02,
        //       params: [0, amountOfTokenBUser02]
        //     }
        //   ]

        //   const fnActions = actions.map(action => {
        //     const fn = async () => action.contract.connect(action.user)[action.name](...action.params)
        //     return fn
        //   })

        //   for (const fn of fnActions) {
        //     await fn()
        //   }

        //   const balanceAfterTokenAPool = await mockTokenA.balanceOf(amm.address)
        //   const balanceAfterTokenBPool = await mockTokenB.balanceOf(amm.address)

        //   const balanceAfterTokenAUser00 = await mockTokenA.balanceOf(user00Address)
        //   const balanceAfterTokenBUser00 = await mockTokenB.balanceOf(user00Address)

        //   const balanceAfterTokenAUser01 = await mockTokenA.balanceOf(user01Address)
        //   const balanceAfterTokenBUser01 = await mockTokenB.balanceOf(user01Address)

        //   const balanceAfterTokenAUser02 = await mockTokenA.balanceOf(user02Address)
        //   const balanceAfterTokenBUser02 = await mockTokenB.balanceOf(user02Address)

        //   // price AB => units of B to buy 1 A =>
        //   const initialValueUser00inA = getValueInUnitsOfTokenA(amountOfTokenAUser00, amountOfTokenBUser00, tokenADecimals, tokenBDecimals, tokenPrice00)

        //   const finalValueUser00inA = getValueInUnitsOfTokenA(balanceAfterTokenAUser00, balanceAfterTokenBUser00, tokenADecimals, tokenBDecimals, tokenPrice00)

        //   console.log('amountOfTokenAUser00', amountOfTokenAUser00.toString())
        //   console.log('amountOfTokenBUser00', amountOfTokenBUser00.toString())
        //   console.log('tokenADecimals', tokenADecimals)
        //   console.log('tokenBDecimals', tokenBDecimals)
        //   console.log('priceAB', tokenPrice00.toString())

        //   console.log('balanceAfterTokenAUser00', balanceAfterTokenAUser00.toString())
        //   console.log('balanceAfterTokenBUser00', balanceAfterTokenBUser00.toString())

        //   const initialValueUser01inA = getValueInUnitsOfTokenA(amountOfTokenAUser01, amountOfTokenBUser01, tokenADecimals, tokenBDecimals, tokenPrice00)

        //   const finalValueUser01inA = getValueInUnitsOfTokenA(balanceAfterTokenAUser01, balanceAfterTokenBUser01, tokenADecimals, tokenBDecimals, tokenPrice00)

        //   const initialValueUser02inA = getValueInUnitsOfTokenA(amountOfTokenAUser02, amountOfTokenBUser02, tokenADecimals, tokenBDecimals, tokenPrice00)

        //   const finalValueUser02inA = getValueInUnitsOfTokenA(balanceAfterTokenAUser02, balanceAfterTokenBUser02, tokenADecimals, tokenBDecimals, tokenPrice00)

        //   expect(balanceAfterTokenAPool).to.equal(toBigNumber(0))
        //   expect(balanceAfterTokenBPool).to.equal(toBigNumber(0))

      //   expect(initialValueUser00inA).to.equal(finalValueUser00inA)
      //   expect(initialValueUser01inA).to.equal(finalValueUser01inA)
      //   expect(initialValueUser02inA).to.equal(finalValueUser02inA)
      // })
      })
    })

    describe('Scenario group ATPR - Add Liquidity / Trade / Price change / Remove Liquidity', () => {
      it('Impermanent Loss should be equal between participants - 3 adds / 1 trade(buy) / 1 price(up) / 3 removed un-order', async () => {
        const amountOfTokenAUser00 = toBigNumber(500).mul(toBigNumber(10 ** scenario.tokenADecimals))
        const amountOfTokenBUser00 = toBigNumber(3000).mul(toBigNumber(10 ** scenario.tokenBDecimals))

        const amountOfTokenAUser01 = toBigNumber(100).mul(toBigNumber(10 ** scenario.tokenADecimals))
        const amountOfTokenBUser01 = toBigNumber(0)

        const amountOfTokenAUser02 = toBigNumber(0)
        const amountOfTokenBUser02 = toBigNumber(4000).mul(toBigNumber(10 ** scenario.tokenBDecimals))

        const amountOfTokenAUser04Bought = toBigNumber(2).mul(toBigNumber(10 ** scenario.tokenADecimals))

        const tokenPrice00 = toBigNumber(400).mul(toBigNumber(10 ** scenario.tokenBDecimals))
        const tokenPrice01 = toBigNumber(500).mul(toBigNumber(10 ** scenario.tokenBDecimals))

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
            name: 'mint',
            contract: mockTokenA,
            user: user03,
            params: [amountOfTokenAUser04Bought]
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
            name: 'approve',
            contract: mockTokenA,
            user: user03,
            params: [amm.address, amountOfTokenAUser04Bought]
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
            params: [amountOfTokenAUser00, amountOfTokenBUser00, user00Address]
          },
          {
            name: 'addLiquidity',
            contract: amm,
            user: user01,
            params: [amountOfTokenAUser01, 0, user01Address]
          },
          {
            name: 'addLiquidity',
            contract: amm,
            user: user02,
            params: [0, amountOfTokenBUser02, user02Address]
          },
          {
            name: 'tradeExactAInput',
            contract: amm,
            user: user03,
            params: [amountOfTokenAUser04Bought, 0, user03Address]
          },
          {
            name: 'setPrice',
            contract: amm,
            user: user00,
            params: [tokenPrice01]
          },
          {
            name: 'removeLiquidity',
            contract: amm,
            user: user01,
            params: [100, 0]
          },
          {
            name: 'removeLiquidity',
            contract: amm,
            user: user00,
            params: [100, 100]
          },
          {
            name: 'removeLiquidity',
            contract: amm,
            user: user02,
            params: [0, 100]
          }
        ]

        const fnActions = actions.map(action => {
          const fn = async () => action.contract.connect(action.user)[action.name](...action.params)
          return fn
        })

        for (const fn of fnActions) {
          await fn()
        }

        const balanceAfterTokenAPool = await mockTokenA.balanceOf(amm.address)
        const balanceAfterTokenBPool = await mockTokenB.balanceOf(amm.address)

        const balanceAfterTokenAUser00 = await mockTokenA.balanceOf(user00Address)
        const balanceAfterTokenBUser00 = await mockTokenB.balanceOf(user00Address)

        const balanceAfterTokenAUser01 = await mockTokenA.balanceOf(user01Address)
        const balanceAfterTokenBUser01 = await mockTokenB.balanceOf(user01Address)

        const balanceAfterTokenAUser02 = await mockTokenA.balanceOf(user02Address)
        const balanceAfterTokenBUser02 = await mockTokenB.balanceOf(user02Address)

        // price AB => units of B to buy 1 A =>

        const user00ImpermanentLoss = calculateImpermanentLoss(amountOfTokenAUser00, amountOfTokenBUser00, balanceAfterTokenAUser00, balanceAfterTokenBUser00, tokenADecimals, tokenPrice01)

        const user01ImpermanentLoss = calculateImpermanentLoss(amountOfTokenAUser01, amountOfTokenBUser01, balanceAfterTokenAUser01, balanceAfterTokenBUser01, tokenADecimals, tokenPrice01)

        const user02ImpermanentLoss = calculateImpermanentLoss(amountOfTokenAUser02, amountOfTokenBUser02, balanceAfterTokenAUser02, balanceAfterTokenBUser02, tokenADecimals, tokenPrice01)

        expect(balanceAfterTokenAPool).to.equal(toBigNumber(0))
        expect(balanceAfterTokenBPool).to.equal(toBigNumber(0))

        expect(approximately(user00ImpermanentLoss, user01ImpermanentLoss, 1)).to.equal(true)
        expect(approximately(user00ImpermanentLoss, user02ImpermanentLoss, 1)).to.equal(true)
        expect(approximately(user01ImpermanentLoss, user02ImpermanentLoss, 1)).to.equal(true)
      })
      it('Impermanent Loss should be equal between participants - 3 adds / 1 trade(buy) / 1 price(down) / 3 removed un-order', async () => {
        const amountOfTokenAUser00 = toBigNumber(500).mul(toBigNumber(10 ** scenario.tokenADecimals))
        const amountOfTokenBUser00 = toBigNumber(3000).mul(toBigNumber(10 ** scenario.tokenBDecimals))

        const amountOfTokenAUser01 = toBigNumber(100).mul(toBigNumber(10 ** scenario.tokenADecimals))
        const amountOfTokenBUser01 = toBigNumber(0)

        const amountOfTokenAUser02 = toBigNumber(0)
        const amountOfTokenBUser02 = toBigNumber(4000).mul(toBigNumber(10 ** scenario.tokenBDecimals))

        const amountOfTokenAUser04Bought = toBigNumber(2).mul(toBigNumber(10 ** scenario.tokenADecimals))

        const tokenPrice00 = toBigNumber(400).mul(toBigNumber(10 ** scenario.tokenBDecimals))
        const tokenPrice01 = toBigNumber(300).mul(toBigNumber(10 ** scenario.tokenBDecimals))

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
            name: 'mint',
            contract: mockTokenA,
            user: user03,
            params: [amountOfTokenAUser04Bought]
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
            name: 'approve',
            contract: mockTokenA,
            user: user03,
            params: [amm.address, amountOfTokenAUser04Bought]
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
            params: [amountOfTokenAUser00, amountOfTokenBUser00, user00Address]
          },
          {
            name: 'addLiquidity',
            contract: amm,
            user: user01,
            params: [amountOfTokenAUser01, 0, user01Address]
          },
          {
            name: 'addLiquidity',
            contract: amm,
            user: user02,
            params: [0, amountOfTokenBUser02, user02Address]
          },
          {
            name: 'tradeExactAInput',
            contract: amm,
            user: user03,
            params: [amountOfTokenAUser04Bought, 0, user03Address]
          },
          {
            name: 'setPrice',
            contract: amm,
            user: user00,
            params: [tokenPrice01]
          },
          {
            name: 'removeLiquidity',
            contract: amm,
            user: user01,
            params: [100, 0]
          },
          {
            name: 'removeLiquidity',
            contract: amm,
            user: user00,
            params: [100, 100]
          },
          {
            name: 'removeLiquidity',
            contract: amm,
            user: user02,
            params: [0, 100]
          }
        ]

        const fnActions = actions.map(action => {
          const fn = async () => action.contract.connect(action.user)[action.name](...action.params)
          return fn
        })

        for (const fn of fnActions) {
          await fn()
        }

        const balanceAfterTokenAPool = await mockTokenA.balanceOf(amm.address)
        const balanceAfterTokenBPool = await mockTokenB.balanceOf(amm.address)

        const balanceAfterTokenAUser00 = await mockTokenA.balanceOf(user00Address)
        const balanceAfterTokenBUser00 = await mockTokenB.balanceOf(user00Address)

        const balanceAfterTokenAUser01 = await mockTokenA.balanceOf(user01Address)
        const balanceAfterTokenBUser01 = await mockTokenB.balanceOf(user01Address)

        const balanceAfterTokenAUser02 = await mockTokenA.balanceOf(user02Address)
        const balanceAfterTokenBUser02 = await mockTokenB.balanceOf(user02Address)

        const user00ImpermanentLoss = calculateImpermanentLoss(amountOfTokenAUser00, amountOfTokenBUser00, balanceAfterTokenAUser00, balanceAfterTokenBUser00, tokenADecimals, tokenPrice01)

        const user01ImpermanentLoss = calculateImpermanentLoss(amountOfTokenAUser01, amountOfTokenBUser01, balanceAfterTokenAUser01, balanceAfterTokenBUser01, tokenADecimals, tokenPrice01)

        const user02ImpermanentLoss = calculateImpermanentLoss(amountOfTokenAUser02, amountOfTokenBUser02, balanceAfterTokenAUser02, balanceAfterTokenBUser02, tokenADecimals, tokenPrice01)

        expect(balanceAfterTokenAPool).to.equal(toBigNumber(0))
        expect(balanceAfterTokenBPool).to.equal(toBigNumber(0))

        expect(approximately(user00ImpermanentLoss, user01ImpermanentLoss, 1)).to.equal(true)
        expect(approximately(user00ImpermanentLoss, user02ImpermanentLoss, 1)).to.equal(true)
        expect(approximately(user01ImpermanentLoss, user02ImpermanentLoss, 1)).to.equal(true)
      })
      it('Impermanent Loss should be equal between participants - 3 adds / 1 trade(buy) / 1 price(up) / 3 removed un-order', async () => {})
      it('Impermanent Loss should be equal between participants - 3 adds / 1 trade(sell) / 1 price(down) / 3 removed un-order', async () => {})
      it('Impermanent Loss should be equal between participants - 3 adds / 1 trade(sell) / 1 price(up) / 3 removed un-order', async () => {})
    })

    describe('Re-Add Liquidity - The sum of withdraws in value for a combined deposit should be equal to a two separate ones', async () => {
      it('APR', async () => {
        const amountOfTokenAUser00 = await toBigNumber(50).mul(toBigNumber(10 ** scenario.tokenADecimals))
        const amountOfTokenBUser00 = await toBigNumber(3000).mul(toBigNumber(10 ** scenario.tokenBDecimals))

        const amountOfTokenAUser01 = toBigNumber(0)
        const amountOfTokenBUser01 = await toBigNumber(100).mul(toBigNumber(10 ** scenario.tokenBDecimals))
        const amountOfTokenBUser01Withdraw = await toBigNumber(50).mul(toBigNumber(10 ** scenario.tokenBDecimals))

        const amountOfTokenAUser02 = toBigNumber(0)
        const amountOfTokenBUser02 = await toBigNumber(100).mul(toBigNumber(10 ** scenario.tokenBDecimals))

        const amountOfTokenBUser02Withdraw = await toBigNumber(50).mul(toBigNumber(10 ** scenario.tokenBDecimals))

        const amountOfTokenAUser03Bought = toBigNumber(2).mul(toBigNumber(10 ** scenario.tokenADecimals))

        const tokenPrice00 = toBigNumber(400).mul(toBigNumber(10 ** scenario.tokenBDecimals))
        const tokenPrice01 = toBigNumber(500).mul(toBigNumber(10 ** scenario.tokenBDecimals))

        const actionsA = [
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
            contract: mockTokenB,
            user: user01,
            params: [amountOfTokenBUser01]
          },
          {
            name: 'mint',
            contract: mockTokenB,
            user: user02,
            params: [amountOfTokenBUser02]
          },
          {
            name: 'mint',
            contract: mockTokenA,
            user: user03,
            params: [amountOfTokenAUser03Bought]
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
            contract: mockTokenB,
            user: user01,
            params: [amm.address, amountOfTokenBUser01]
          },
          {
            name: 'approve',
            contract: mockTokenB,
            user: user02,
            params: [amm.address, amountOfTokenBUser02]
          },
          {
            name: 'approve',
            contract: mockTokenA,
            user: user03,
            params: [amm.address, amountOfTokenAUser03Bought]
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
            params: [amountOfTokenAUser00, amountOfTokenBUser00, user00Address]
          },
          {
            name: 'addLiquidity',
            contract: amm,
            user: user01,
            params: [0, amountOfTokenBUser01, user01Address]
          },
          {
            name: 'tradeExactAInput',
            contract: amm,
            user: user03,
            params: [amountOfTokenAUser03Bought, 0, user03Address]
          },
          {
            name: 'setPrice',
            contract: amm,
            user: user00,
            params: [tokenPrice01]
          },
          {
            name: 'addLiquidity',
            contract: amm,
            user: user02,
            params: [0, amountOfTokenBUser02, user02Address]
          },
          {
            name: 'removeLiquidity',
            contract: amm,
            user: user01,
            params: [0, 100]
          },
          {
            name: 'removeLiquidity',
            contract: amm,
            user: user02,
            params: [0, 100]
          }
        ]

        const fnActionsA = actionsA.map(action => {
          const fn = async () => action.contract.connect(action.user)[action.name](...action.params)
          return fn
        })

        for (const fn of fnActionsA) {
          await fn()
        }

        const balanceAfterPoolTokenA = await mockTokenA.balanceOf(amm.address)
        const balanceAfterPoolTokenB = await mockTokenB.balanceOf(amm.address)

        const balanceAfterUser01TokenA = await mockTokenA.balanceOf(user01Address)
        const balanceAfterUser01TokenB = await mockTokenB.balanceOf(user01Address)

        const balanceAfterUser02TokenA = await mockTokenA.balanceOf(user02Address)
        const balanceAfterUser02TokenB = await mockTokenB.balanceOf(user02Address)

        // tokenC = tokenA / tokenD = tokenB
        const [mockTokenC, mockTokenD, ammB] = await deployScenario()

        const actionsB = [
          {
            name: 'mint',
            contract: mockTokenC,
            user: user00,
            params: [amountOfTokenAUser00]
          },
          {
            name: 'mint',
            contract: mockTokenD,
            user: user00,
            params: [amountOfTokenBUser00]
          },
          {
            name: 'mint',
            contract: mockTokenD,
            user: user01,
            params: [amountOfTokenBUser01]
          },
          {
            name: 'mint',
            contract: mockTokenD,
            user: user01,
            params: [amountOfTokenBUser01]
          },
          {
            name: 'mint',
            contract: mockTokenC,
            user: user03,
            params: [amountOfTokenAUser03Bought]
          },
          {
            name: 'approve',
            contract: mockTokenC,
            user: user00,
            params: [ammB.address, amountOfTokenAUser00]
          },
          {
            name: 'approve',
            contract: mockTokenD,
            user: user00,
            params: [ammB.address, amountOfTokenBUser00]
          },
          {
            name: 'approve',
            contract: mockTokenD,
            user: user01,
            params: [ammB.address, amountOfTokenBUser01.mul(toBigNumber(2))]
          },
          {
            name: 'approve',
            contract: mockTokenC,
            user: user03,
            params: [ammB.address, amountOfTokenAUser03Bought]
          },
          {
            name: 'setPrice',
            contract: ammB,
            user: user00,
            params: [tokenPrice00]
          },
          {
            name: 'addLiquidity',
            contract: ammB,
            user: user00,
            params: [amountOfTokenAUser00, amountOfTokenBUser00, user00Address]
          },
          {
            name: 'addLiquidity',
            contract: ammB,
            user: user01,
            params: [0, amountOfTokenBUser01, user01Address]
          },
          {
            name: 'tradeExactAInput',
            contract: ammB,
            user: user03,
            params: [amountOfTokenAUser03Bought, 0, user03Address]
          },
          {
            name: 'setPrice',
            contract: ammB,
            user: user00,
            params: [tokenPrice01]
          },
          {
            name: 'addLiquidity',
            contract: ammB,
            user: user01,
            params: [0, amountOfTokenBUser01, user01Address]
          }
        ]

        const fnActionsB = actionsB.map(action => {
          const fn = async () => action.contract.connect(action.user)[action.name](...action.params)
          return fn
        })

        for (const fn of fnActionsB) {
          await fn()
        }

        await ammB.connect(user01).removeLiquidity(0, 100)

        const balanceAfterUser01TokenC = await mockTokenC.balanceOf(user01Address)
        const balanceAfterUser01TokenD = await mockTokenD.balanceOf(user01Address)

        expect(balanceAfterUser01TokenA.add(balanceAfterUser02TokenA)).to.equal(balanceAfterUser01TokenC)
        expect(balanceAfterUser01TokenB.add(balanceAfterUser02TokenB)).to.equal(balanceAfterUser01TokenD)
      })
    })

    it('should not be able to trade in zero-address behalf', async () => {
      const amountTokenAToMint = await toBigNumber(1).mul(toBigNumber(10 ** scenario.tokenADecimals))
      const amountTokenBToMint = await toBigNumber(1).mul(toBigNumber(10 ** scenario.tokenBDecimals))

      await mockTokenA.connect(userA).mint(amountTokenAToMint)
      await mockTokenA.connect(userA).approve(amm.address, amountTokenAToMint)

      await mockTokenB.connect(userA).mint(amountTokenBToMint)
      await mockTokenB.connect(userA).approve(amm.address, amountTokenBToMint)

      await amm.connect(userA).addLiquidity(amountTokenAToMint, amountTokenBToMint, userAAddress)

      let tx

      tx = amm.tradeExactAInput(1, 0, ethers.constants.AddressZero)
      await expect(tx).to.be.revertedWith('AMM: transfer to zero address')

      tx = amm.tradeExactAOutput(1, ethers.constants.MaxUint256, ethers.constants.AddressZero)
      await expect(tx).to.be.revertedWith('AMM: transfer to zero address')

      tx = amm.tradeExactBInput(1, 0, ethers.constants.AddressZero)
      await expect(tx).to.be.revertedWith('AMM: transfer to zero address')

      tx = amm.tradeExactBOutput(1, ethers.constants.MaxUint256, ethers.constants.AddressZero)
      await expect(tx).to.be.revertedWith('AMM: transfer to zero address')
    })

    it('should not be able to trade inputting zero-amount', async () => {
      const amountTokenAToMint = await toBigNumber(1).mul(toBigNumber(10 ** scenario.tokenADecimals))
      const amountTokenBToMint = await toBigNumber(1).mul(toBigNumber(10 ** scenario.tokenBDecimals))

      await mockTokenA.connect(userA).mint(amountTokenAToMint)
      await mockTokenA.connect(userA).approve(amm.address, amountTokenAToMint)

      await mockTokenB.connect(userA).mint(amountTokenBToMint)
      await mockTokenB.connect(userA).approve(amm.address, amountTokenBToMint)

      await amm.connect(userA).addLiquidity(amountTokenAToMint, amountTokenBToMint, userAAddress)

      let tx

      tx = amm.tradeExactAInput(0, 0, userBAddress)
      await expect(tx).to.be.revertedWith('AMM: input should be greater than zero')

      tx = amm.tradeExactAOutput(1, 0, userBAddress)
      await expect(tx).to.be.revertedWith('AMM: input should be greater than zero')

      tx = amm.tradeExactBInput(0, amountTokenAToMint, userBAddress)
      await expect(tx).to.be.revertedWith('AMM: input should be greater than zero')

      tx = amm.tradeExactBOutput(1, 0, userBAddress)
      await expect(tx).to.be.revertedWith('AMM: input should be greater than zero')
    })
  })
})

// priceAB => How many units of B to buy A (E.g: price = 10 => 10 B buy 1 A)
function getValueInUnitsOfTokenA (amountTokenA, amountTokenB, tokenADecimals, tokenBDecimals, priceAB) {
  const totalValue = amountTokenA.add(amountTokenB.mul(toBigNumber(10).pow(tokenADecimals)).div(priceAB))
  return totalValue
}

function getValueInUnitsOfTokenY (amountTokenX, amountTokenY, tokenXDecimals, tokenYDecimals, priceXY) {
  const totalValue = amountTokenY.add(priceXY.mul(amountTokenX).div(toBigNumber(10).pow(tokenXDecimals)))
  return totalValue
}

function calculateImpermanentLoss (initialValueA, initialValueB, finalValueA, finalValueB, tokenADecimals, finalPrice) {
  const numerator = initialValueA.mul(finalPrice).div(toBigNumber(10).pow(tokenADecimals)).add(initialValueB).mul(toBigNumber(10).pow(toBigNumber(34)))
  const denominator = finalValueA.mul(finalPrice).div(toBigNumber(10).pow(tokenADecimals)).add(finalValueB)
  const IL = numerator.div(denominator)
  return IL
}
