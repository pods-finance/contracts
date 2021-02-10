const { expect } = require('chai')
const BigNumber = require('bignumber.js')
const forceExpiration = require('../util/forceExpiration')
const createPriceFeedMock = require('../util/createPriceFeedMock')
const createMockOption = require('../util/createMockOption')
const createNewPool = require('../util/createNewPool')
const createOptionFactory = require('../util/createOptionFactory')
const { toBigNumber, approximately } = require('../../utils/utils')
const createConfigurationManager = require('../util/createConfigurationManager')
const mintOptions = require('../util/mintOptions')
const addLiquidity = require('../util/addLiquidity')
const getTimestamp = require('../util/getTimestamp')

const OPTION_TYPE_PUT = 0
const OPTION_TYPE_CALL = 1
const EXERCISE_TYPE_EUROPEAN = 0

const scenarios = [
  {
    name: 'WBTC/USDC',
    optionType: OPTION_TYPE_PUT,
    underlyingAssetSymbol: 'WBTC',
    underlyingAssetDecimals: 8,
    expiration: 60 * 60 * 24 * 7, // 7 days
    strikeAssetSymbol: 'USDC',
    strikeAssetDecimals: 6,
    strikePrice: toBigNumber(17000e6),
    strikePriceDecimals: 6,
    amountToMint: ethers.BigNumber.from(1e8.toString()),
    amountToMintTooLow: 1,
    amountOfStableToAddLiquidity: ethers.BigNumber.from(1e8.toString()),
    initialFImp: ethers.BigNumber.from('10').pow(54),
    initialSpotPrice: toBigNumber(18000e8),
    spotPriceDecimals: 8,
    initialSigma: toBigNumber(0.661e18),
    expectedNewIV: toBigNumber(0.66615e18),
    cap: ethers.BigNumber.from(2000000e6.toString())
  }
]

scenarios.forEach(scenario => {
  describe('OptionAMMPool.sol - ' + scenario.name, () => {
    let MockERC20, MockWETH, OptionAMMFactory
    let mockWETH
    let configurationManager
    let mockUnderlyingAsset
    let mockStrikeAsset
    let factoryContract
    let optionAMMFactory
    let priceProvider
    let podPut
    let optionAMMPool
    let deployer
    let deployerAddress
    let second
    let secondAddress
    let buyer
    let buyerAddress
    let delegator
    let delegatorAddress
    let lp
    let lpAddress
    let defaultPriceFeed

    async function MintPhase (amountOfOptionsToMint, signer = deployer, owner = deployerAddress) {
      const amountToMintBN = ethers.BigNumber.from(amountOfOptionsToMint)
      const optionsDecimals = await podPut.decimals()
      await mockStrikeAsset.connect(signer).approve(podPut.address, ethers.constants.MaxUint256)
      // calculate amount of Strike necessary to mint
      await mockStrikeAsset.connect(signer).mint(scenario.strikePrice.mul(amountOfOptionsToMint).add(1))

      await podPut.connect(signer).mint(amountToMintBN.mul(toBigNumber(10).pow(optionsDecimals)), owner)
    }

    before(async () => {
      ;[deployer, second, buyer, delegator, lp] = await ethers.getSigners()

      ;[deployerAddress, secondAddress, buyerAddress, delegatorAddress, lpAddress] = await Promise.all([
        deployer.getAddress(),
        second.getAddress(),
        buyer.getAddress(),
        delegator.getAddress(),
        lp.getAddress()
      ])

      ;[MockERC20, MockWETH, OptionAMMFactory] = await Promise.all([
        ethers.getContractFactory('MintableERC20'),
        ethers.getContractFactory('WETH'),
        ethers.getContractFactory('OptionAMMFactory')
      ])

      ;[mockWETH, mockUnderlyingAsset, mockStrikeAsset] = await Promise.all([
        MockWETH.deploy(),
        MockERC20.deploy(scenario.underlyingAssetSymbol, scenario.underlyingAssetSymbol, scenario.underlyingAssetDecimals),
        MockERC20.deploy(scenario.strikeAssetSymbol, scenario.strikeAssetSymbol, scenario.strikeAssetDecimals)
      ])
      defaultPriceFeed = await createPriceFeedMock(deployer)
    })

    beforeEach(async function () {
      const PriceProvider = await ethers.getContractFactory('PriceProvider')
      await defaultPriceFeed.setDecimals(scenario.spotPriceDecimals)
      await defaultPriceFeed.setRoundData({
        roundId: 1,
        answer: scenario.initialSpotPrice,
        startedAt: await getTimestamp(),
        updatedAt: await getTimestamp() + 1,
        answeredInRound: 1
      })
      priceProvider = await PriceProvider.deploy([mockUnderlyingAsset.address], [defaultPriceFeed.contract.address])

      configurationManager = await createConfigurationManager(priceProvider)
      factoryContract = await createOptionFactory(mockWETH.address, configurationManager)

      podPut = await createMockOption({
        underlyingAsset: mockUnderlyingAsset.address,
        strikeAsset: mockStrikeAsset.address,
        strikePrice: scenario.strikePrice,
        configurationManager
      })

      optionAMMFactory = await OptionAMMFactory.deploy(configurationManager.address)
      optionAMMPool = await createNewPool(deployerAddress, optionAMMFactory, podPut.address, mockStrikeAsset.address, scenario.initialSigma)
    })

    describe('Constructor/Initialization checks', () => {
      it('should have correct option data (strikePrice, expiration, strikeAsset)', async () => {
        expect(await optionAMMPool.tokenB()).to.equal(mockStrikeAsset.address)
        expect(await optionAMMPool.tokenA()).to.equal(podPut.address)

        const optionExpiration = await podPut.expiration()
        const optionStrikePrice = await podPut.strikePrice()
        const optionStrikePriceDecimals = await podPut.strikePriceDecimals()
        const priceProperties = await optionAMMPool.priceProperties()
        const bsDecimals = await optionAMMPool.BS_RES_DECIMALS()

        expect(priceProperties.expiration).to.equal(optionExpiration)
        expect(priceProperties.strikePrice).to.equal(optionStrikePrice.mul(toBigNumber(10).pow(bsDecimals.sub(optionStrikePriceDecimals))))
      })

      it('should return spotPrice accordingly', async () => {
        const spotPrice = await optionAMMPool.getSpotPrice(mockUnderlyingAsset.address, 18)
        const bsDecimals = await optionAMMPool.BS_RES_DECIMALS()
        expect(spotPrice).to.equal(scenario.initialSpotPrice.mul(toBigNumber(10).pow(bsDecimals.sub(scenario.spotPriceDecimals))))
      })

      it('should not allow trade after option expiration', async () => {
        const expiration = await podPut.expiration()
        await forceExpiration(podPut, parseInt(expiration.toString()))
        await expect(optionAMMPool.connect(buyer).tradeExactBOutput(0, ethers.constants.MaxUint256, buyerAddress, scenario.initialSigma)).to.be.revertedWith('OptionAMMPool: option has expired')
      })

      it('should not allow add liquidity after option expiration', async () => {
        const expiration = await podPut.expiration()
        await forceExpiration(podPut, parseInt(expiration.toString()))
        await expect(optionAMMPool.connect(buyer).addLiquidity(0, 0, buyerAddress)).to.be.revertedWith('OptionAMMPool: option has expired')
      })
    })

    describe('Reading functions', () => {
      it('should return the ABPrice', async () => {
        await expect(optionAMMPool.getABPrice()).to.not.be.reverted
      })
    })

    describe('Add Liquidity', () => {
      it('should revert if user dont supply liquidity of both assets', async () => {
        await expect(optionAMMPool.addLiquidity(0, 0, buyerAddress)).to.be.revertedWith('AMM: you should add both tokens on the first liquidity')
      })

      it('should revert if user ask more assets to it has in balance', async () => {
        await expect(optionAMMPool.addLiquidity(1000, 10000, buyerAddress)).to.be.revertedWith('ERC20: transfer amount exceeds balance')
      })

      it('should revert if user do not approved one of assets to be spent by OptionAMMPool', async () => {
        // Mint option and Stable asset to the liquidity adder
        await MintPhase(1)
        await mockStrikeAsset.mint(scenario.amountOfStableToAddLiquidity.add(1))
        const optionBalance = await podPut.balanceOf(deployerAddress)
        await expect(optionAMMPool.addLiquidity(scenario.amountOfStableToAddLiquidity, optionBalance.toString(), buyerAddress))
          .to.be.revertedWith('ERC20: transfer amount exceeds allowance')
      })

      it('should not be able to add more liquidity than the cap', async () => {
        const capProvider = await ethers.getContractAt('CapProvider', configurationManager.getCapProvider())
        capProvider.setCap(optionAMMPool.address, scenario.cap)

        const capSize = await optionAMMPool.capSize()
        const capExceeded = capSize.add(1)

        await mockStrikeAsset.mint(capExceeded)
        await expect(optionAMMPool.addLiquidity(0, capExceeded, buyerAddress))
          .to.be.revertedWith('CappedPool: amount exceed cap')
      })

      it('should revert if any dependency contract is stopped', async () => {
        const emergencyStop = await ethers.getContractAt(
          'EmergencyStop',
          await configurationManager.getEmergencyStop()
        )

        await emergencyStop.stop(await configurationManager.getPriceProvider())

        await mintOptions(podPut, scenario.amountToMint, deployer)

        await mockStrikeAsset.mint(scenario.amountOfStableToAddLiquidity)
        await mockStrikeAsset.approve(optionAMMPool.address, scenario.amountOfStableToAddLiquidity)
        await podPut.approve(optionAMMPool.address, scenario.amountToMint)

        await expect(
          optionAMMPool.addLiquidity(scenario.amountToMint, scenario.amountOfStableToAddLiquidity, deployerAddress)
        ).to.be.revertedWith('OptionAMMPool: Pool is stopped')
      })

      it('should revert if add liquidity when the option price is zero', async () => {
        const amountOfStrikeLpNeed = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfStrikeLpToMintOption = scenario.strikePrice.mul(toBigNumber(100)).add(1)
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const initialBuyerBalanceStrikeAsset = toBigNumber(10000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const numberOfOptionsToBuy = toBigNumber(3).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        const balanceBeforeOptionBuyer = await podPut.balanceOf(buyerAddress)
        const balanceBeforeStrikeBuyer = await mockStrikeAsset.balanceOf(buyerAddress)

        const actions = [
          {
            name: 'mint',
            contract: mockStrikeAsset,
            user: lp,
            params: [amountOfStrikeLpNeed.add(amountOfStrikeLpToMintOption)]
          },
          {
            name: 'approve',
            contract: mockStrikeAsset,
            user: lp,
            params: [podPut.address, amountOfStrikeLpToMintOption]
          },
          {
            name: 'mint',
            contract: podPut,
            user: lp,
            params: [amountOfOptionsToMint, lpAddress]
          },
          {
            name: 'approve',
            contract: mockStrikeAsset,
            user: lp,
            params: [optionAMMPool.address, amountOfStrikeLpNeed]
          },
          {
            name: 'approve',
            contract: podPut,
            user: lp,
            params: [optionAMMPool.address, amountOfOptionsToMint]
          },
          {
            name: 'addLiquidity',
            contract: optionAMMPool,
            user: lp,
            params: [amountOfOptionsToMint, amountOfStrikeLpNeed, lpAddress]
          }
        ]

        const fnActions = actions.map(action => {
          const fn = async () => action.contract.connect(action.user)[action.name](...action.params)
          return fn
        })

        for (const fn of fnActions) {
          await fn()
        }

        const expiration = await podPut.expiration()

        const nearExpiration = expiration - 60 * 60 * 2 // 2 hours before expiration
        await ethers.provider.send('evm_mine', [nearExpiration])
        await defaultPriceFeed.setUpdateAt(await getTimestamp())

        await expect(optionAMMPool.addLiquidity(1000, 10000, lpAddress)).to.be.revertedWith('AMM: can not add liquidity when option price is zero')
      })
    })

    describe('Remove Liquidity', () => {
      it('should remove all amount after simple addition', async () => {
        const amountOfStrikeLpNeed = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfStrikeLpToMintOption = scenario.strikePrice.mul(toBigNumber(100)).add(1)
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const initialBuyerBalanceStrikeAsset = toBigNumber(10000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const numberOfOptionsToBuy = toBigNumber(3).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        const balanceBeforeOptionBuyer = await podPut.balanceOf(buyerAddress)
        const balanceBeforeStrikeBuyer = await mockStrikeAsset.balanceOf(buyerAddress)

        const actions = [
          {
            name: 'mint',
            contract: mockStrikeAsset,
            user: lp,
            params: [amountOfStrikeLpNeed.add(amountOfStrikeLpToMintOption)]
          },
          {
            name: 'approve',
            contract: mockStrikeAsset,
            user: lp,
            params: [podPut.address, amountOfStrikeLpToMintOption]
          },
          {
            name: 'mint',
            contract: podPut,
            user: lp,
            params: [amountOfOptionsToMint, lpAddress]
          },
          {
            name: 'approve',
            contract: mockStrikeAsset,
            user: lp,
            params: [optionAMMPool.address, amountOfStrikeLpNeed]
          },
          {
            name: 'approve',
            contract: podPut,
            user: lp,
            params: [optionAMMPool.address, amountOfOptionsToMint]
          },
          {
            name: 'addLiquidity',
            contract: optionAMMPool,
            user: lp,
            params: [amountOfOptionsToMint, amountOfStrikeLpNeed, lpAddress]
          }
        ]

        const fnActions = actions.map(action => {
          const fn = async () => action.contract.connect(action.user)[action.name](...action.params)
          return fn
        })

        for (const fn of fnActions) {
          await fn()
        }

        const feeAddressA = await optionAMMPool.feePoolA()
        const feeAddressB = await optionAMMPool.feePoolB()

        const lpStrikeBeforeTrade = await mockStrikeAsset.balanceOf(lpAddress)
        const lpOptionBeforeTrade = await podPut.balanceOf(lpAddress)

        const [poolOptionAmountBeforeTrade, poolStrikeAmountBeforeTrade] = await optionAMMPool.getPoolBalances()

        await optionAMMPool.connect(lp).removeLiquidity(100, 100)

        const lpOptionAfterBuyer = await podPut.balanceOf(lpAddress)
        const lpStrikeAfterBuyer = await mockStrikeAsset.balanceOf(lpAddress)

        const [poolOptionAmountAfterTrade, poolStrikeAmountAfterTrade] = await optionAMMPool.getPoolBalances()

        expect(poolOptionAmountAfterTrade).to.eq(0)
        expect(poolStrikeAmountAfterTrade).to.eq(0)
        expect(lpStrikeAfterBuyer).to.eq(lpStrikeAfterBuyer)

        const feePoolABalancefterStrike = await mockStrikeAsset.balanceOf(feeAddressA)
        const feePoolBBalanceAfterStrike = await mockStrikeAsset.balanceOf(feeAddressB)

        expect(feePoolABalancefterStrike).to.eq(0)
        expect(feePoolBBalanceAfterStrike).to.eq(0)
      })

      it('should revert if any dependency contract is stopped', async () => {
        const emergencyStop = await ethers.getContractAt(
          'EmergencyStop',
          await configurationManager.getEmergencyStop()
        )

        await mintOptions(podPut, scenario.amountToMint, deployer)

        await mockStrikeAsset.mint(scenario.amountOfStableToAddLiquidity)
        await mockStrikeAsset.approve(optionAMMPool.address, scenario.amountOfStableToAddLiquidity)
        await podPut.approve(optionAMMPool.address, scenario.amountToMint)

        await optionAMMPool.addLiquidity(scenario.amountToMint, scenario.amountOfStableToAddLiquidity, deployerAddress)

        await emergencyStop.stop(await configurationManager.getPriceProvider())

        await expect(
          optionAMMPool.removeLiquidity(scenario.amountToMint, scenario.amountOfStableToAddLiquidity)
        ).to.be.revertedWith('OptionAMMPool: Pool is stopped')
      })

      it('should remove liquidity when option price is rounded to zero', async () => {
        const amountOfStrikeLpNeed = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfStrikeLpToMintOption = scenario.strikePrice.mul(toBigNumber(100)).add(1)
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const initialBuyerBalanceStrikeAsset = toBigNumber(10000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const numberOfOptionsToBuy = toBigNumber(3).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        const balanceBeforeOptionBuyer = await podPut.balanceOf(buyerAddress)
        const balanceBeforeStrikeBuyer = await mockStrikeAsset.balanceOf(buyerAddress)

        const actions = [
          {
            name: 'mint',
            contract: mockStrikeAsset,
            user: lp,
            params: [amountOfStrikeLpNeed.add(amountOfStrikeLpToMintOption)]
          },
          {
            name: 'approve',
            contract: mockStrikeAsset,
            user: lp,
            params: [podPut.address, amountOfStrikeLpToMintOption]
          },
          {
            name: 'mint',
            contract: podPut,
            user: lp,
            params: [amountOfOptionsToMint, lpAddress]
          },
          {
            name: 'approve',
            contract: mockStrikeAsset,
            user: lp,
            params: [optionAMMPool.address, amountOfStrikeLpNeed]
          },
          {
            name: 'approve',
            contract: podPut,
            user: lp,
            params: [optionAMMPool.address, amountOfOptionsToMint]
          },
          {
            name: 'addLiquidity',
            contract: optionAMMPool,
            user: lp,
            params: [amountOfOptionsToMint, amountOfStrikeLpNeed, lpAddress]
          }
        ]

        const fnActions = actions.map(action => {
          const fn = async () => action.contract.connect(action.user)[action.name](...action.params)
          return fn
        })

        for (const fn of fnActions) {
          await fn()
        }

        const feeAddressA = await optionAMMPool.feePoolA()
        const feeAddressB = await optionAMMPool.feePoolB()

        const lpStrikeBeforeTrade = await mockStrikeAsset.balanceOf(lpAddress)
        const lpOptionBeforeTrade = await podPut.balanceOf(lpAddress)

        const [poolOptionAmountBeforeTrade, poolStrikeAmountBeforeTrade] = await optionAMMPool.getPoolBalances()

        // fast forward until very close to the maturity
        const expiration = await podPut.expiration()

        const nearExpiration = expiration - 60 * 60 * 2 // 2 hours before expiration
        await ethers.provider.send('evm_mine', [nearExpiration])
        await defaultPriceFeed.setUpdateAt(await getTimestamp())

        await optionAMMPool.connect(lp).removeLiquidity(100, 100)

        const lpOptionAfterBuyer = await podPut.balanceOf(lpAddress)
        const lpStrikeAfterBuyer = await mockStrikeAsset.balanceOf(lpAddress)

        const [poolOptionAmountAfterTrade, poolStrikeAmountAfterTrade] = await optionAMMPool.getPoolBalances()

        expect(poolOptionAmountAfterTrade).to.eq(0)
        expect(poolStrikeAmountAfterTrade).to.eq(0)
        expect(lpStrikeAfterBuyer).to.eq(lpStrikeAfterBuyer)

        const feePoolABalancefterStrike = await mockStrikeAsset.balanceOf(feeAddressA)
        const feePoolBBalanceAfterStrike = await mockStrikeAsset.balanceOf(feeAddressB)

        expect(feePoolABalancefterStrike).to.eq(0)
        expect(feePoolBBalanceAfterStrike).to.eq(0)
      })

      it('should remove liquidity after expiration', async () => {
        const amountOfStrikeLpNeed = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfStrikeLpToMintOption = scenario.strikePrice.mul(toBigNumber(100)).add(1)
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const initialBuyerBalanceStrikeAsset = toBigNumber(10000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const numberOfOptionsToBuy = toBigNumber(3).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        const balanceBeforeOptionBuyer = await podPut.balanceOf(buyerAddress)
        const balanceBeforeStrikeBuyer = await mockStrikeAsset.balanceOf(buyerAddress)

        const actions = [
          {
            name: 'mint',
            contract: mockStrikeAsset,
            user: lp,
            params: [amountOfStrikeLpNeed.add(amountOfStrikeLpToMintOption)]
          },
          {
            name: 'approve',
            contract: mockStrikeAsset,
            user: lp,
            params: [podPut.address, amountOfStrikeLpToMintOption]
          },
          {
            name: 'mint',
            contract: podPut,
            user: lp,
            params: [amountOfOptionsToMint, lpAddress]
          },
          {
            name: 'approve',
            contract: mockStrikeAsset,
            user: lp,
            params: [optionAMMPool.address, amountOfStrikeLpNeed]
          },
          {
            name: 'approve',
            contract: podPut,
            user: lp,
            params: [optionAMMPool.address, amountOfOptionsToMint]
          },
          {
            name: 'addLiquidity',
            contract: optionAMMPool,
            user: lp,
            params: [amountOfOptionsToMint, amountOfStrikeLpNeed, lpAddress]
          }
        ]

        const fnActions = actions.map(action => {
          const fn = async () => action.contract.connect(action.user)[action.name](...action.params)
          return fn
        })

        for (const fn of fnActions) {
          await fn()
        }

        const feeAddressA = await optionAMMPool.feePoolA()
        const feeAddressB = await optionAMMPool.feePoolB()

        const lpStrikeBeforeTrade = await mockStrikeAsset.balanceOf(lpAddress)
        const lpOptionBeforeTrade = await podPut.balanceOf(lpAddress)

        const [poolOptionAmountBeforeTrade, poolStrikeAmountBeforeTrade] = await optionAMMPool.getPoolBalances()

        await forceExpiration(podPut)
        await defaultPriceFeed.setUpdateAt(await getTimestamp())

        await optionAMMPool.connect(lp).removeLiquidity(100, 100)

        const lpOptionAfterBuyer = await podPut.balanceOf(lpAddress)
        const lpStrikeAfterBuyer = await mockStrikeAsset.balanceOf(lpAddress)

        const [poolOptionAmountAfterTrade, poolStrikeAmountAfterTrade] = await optionAMMPool.getPoolBalances()

        expect(poolOptionAmountAfterTrade).to.eq(0)
        expect(poolStrikeAmountAfterTrade).to.eq(0)
        expect(lpStrikeAfterBuyer).to.eq(lpStrikeAfterBuyer)

        const feePoolABalancefterStrike = await mockStrikeAsset.balanceOf(feeAddressA)
        const feePoolBBalanceAfterStrike = await mockStrikeAsset.balanceOf(feeAddressB)

        expect(feePoolABalancefterStrike).to.eq(0)
        expect(feePoolBBalanceAfterStrike).to.eq(0)
      })

      it('should remove liquidity single-sided', async () => {
        const amountOfStrikeLpNeed = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfStrikeLpToMintOption = scenario.strikePrice.mul(toBigNumber(100)).add(1)
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const initialBuyerBalanceStrikeAsset = toBigNumber(10000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const numberOfOptionsToBuy = toBigNumber(3).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        const balanceBeforeOptionBuyer = await podPut.balanceOf(buyerAddress)
        const balanceBeforeStrikeBuyer = await mockStrikeAsset.balanceOf(buyerAddress)

        const actions = [
          {
            name: 'mint',
            contract: mockStrikeAsset,
            user: lp,
            params: [amountOfStrikeLpNeed.add(amountOfStrikeLpToMintOption)]
          },
          {
            name: 'approve',
            contract: mockStrikeAsset,
            user: lp,
            params: [podPut.address, amountOfStrikeLpToMintOption]
          },
          {
            name: 'mint',
            contract: podPut,
            user: lp,
            params: [amountOfOptionsToMint, lpAddress]
          },
          {
            name: 'approve',
            contract: mockStrikeAsset,
            user: lp,
            params: [optionAMMPool.address, amountOfStrikeLpNeed]
          },
          {
            name: 'approve',
            contract: podPut,
            user: lp,
            params: [optionAMMPool.address, amountOfOptionsToMint]
          },
          {
            name: 'addLiquidity',
            contract: optionAMMPool,
            user: lp,
            params: [amountOfOptionsToMint, amountOfStrikeLpNeed, lpAddress]
          }
        ]

        const fnActions = actions.map(action => {
          const fn = async () => action.contract.connect(action.user)[action.name](...action.params)
          return fn
        })

        for (const fn of fnActions) {
          await fn()
        }

        const feeAddressA = await optionAMMPool.feePoolA()
        const feeAddressB = await optionAMMPool.feePoolB()

        const lpStrikeBeforeTrade = await mockStrikeAsset.balanceOf(lpAddress)
        const lpOptionBeforeTrade = await podPut.balanceOf(lpAddress)

        const [poolOptionAmountBeforeTrade, poolStrikeAmountBeforeTrade] = await optionAMMPool.getPoolBalances()

        await optionAMMPool.connect(lp).removeLiquidity(100, 0)

        await optionAMMPool.connect(lp).removeLiquidity(0, 100)

        const lpOptionAfterBuyer = await podPut.balanceOf(lpAddress)
        const lpStrikeAfterBuyer = await mockStrikeAsset.balanceOf(lpAddress)

        const [poolOptionAmountAfterTrade, poolStrikeAmountAfterTrade] = await optionAMMPool.getPoolBalances()

        expect(poolOptionAmountAfterTrade).to.eq(0)
        expect(poolStrikeAmountAfterTrade).to.eq(0)
        expect(lpStrikeAfterBuyer).to.eq(lpStrikeAfterBuyer)

        const feePoolABalancefterStrike = await mockStrikeAsset.balanceOf(feeAddressA)
        const feePoolBBalanceAfterStrike = await mockStrikeAsset.balanceOf(feeAddressB)

        expect(feePoolABalancefterStrike).to.eq(0)
        expect(feePoolBBalanceAfterStrike).to.eq(0)
      })
    })

    describe('Price too low', async () => {
      it('should revert transactions if the option price is too low', async () => {
        const amountOfStrikeLpNeed = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfStrikeLpToMintOption = scenario.strikePrice.mul(toBigNumber(100)).add(1)
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const initialBuyerBalanceStrikeAsset = toBigNumber(10000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const numberOfOptionsToBuy = toBigNumber(3).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        const actions = [
          {
            name: 'mint',
            contract: mockStrikeAsset,
            user: lp,
            params: [amountOfStrikeLpNeed.add(amountOfStrikeLpToMintOption)]
          },
          {
            name: 'approve',
            contract: mockStrikeAsset,
            user: lp,
            params: [podPut.address, amountOfStrikeLpToMintOption]
          },
          {
            name: 'mint',
            contract: podPut,
            user: lp,
            params: [amountOfOptionsToMint, lpAddress]
          },
          {
            name: 'approve',
            contract: mockStrikeAsset,
            user: lp,
            params: [optionAMMPool.address, amountOfStrikeLpNeed]
          },
          {
            name: 'approve',
            contract: podPut,
            user: lp,
            params: [optionAMMPool.address, amountOfOptionsToMint]
          },
          {
            name: 'addLiquidity',
            contract: optionAMMPool,
            user: lp,
            params: [amountOfOptionsToMint, amountOfStrikeLpNeed, lpAddress]
          },
          {
            name: 'mint',
            contract: mockStrikeAsset,
            user: buyer,
            params: [initialBuyerBalanceStrikeAsset]
          },
          {
            name: 'approve',
            contract: mockStrikeAsset,
            user: buyer,
            params: [optionAMMPool.address, initialBuyerBalanceStrikeAsset]
          }
        ]

        const fnActions = actions.map(action => {
          const fn = async () => action.contract.connect(action.user)[action.name](...action.params)
          return fn
        })

        for (const fn of fnActions) {
          await fn()
        }

        const expiration = await podPut.expiration()
        await forceExpiration(podPut, parseInt((expiration - 60 * 1).toString()))
        await defaultPriceFeed.setUpdateAt(await getTimestamp())

        await expect(optionAMMPool.connect(buyer).tradeExactAOutput(numberOfOptionsToBuy, ethers.constants.MaxUint256, buyerAddress, scenario.initialSigma)).to.be.revertedWith('AMM: can not trade when option price is zero')

        await expect(optionAMMPool.connect(buyer).tradeExactAInput(numberOfOptionsToBuy, ethers.constants.MaxUint256, buyerAddress, scenario.initialSigma)).to.be.revertedWith('AMM: can not trade when option price is zero')

        await expect(optionAMMPool.connect(buyer).tradeExactBOutput(numberOfOptionsToBuy, ethers.constants.MaxUint256, buyerAddress, scenario.initialSigma)).to.be.revertedWith('AMM: can not trade when option price is zero')

        await expect(optionAMMPool.connect(buyer).tradeExactBInput(numberOfOptionsToBuy, ethers.constants.MaxUint256, buyerAddress, scenario.initialSigma)).to.be.revertedWith('AMM: can not trade when option price is zero')
      })
    })

    describe('tradeExactAOutput', () => {
      it('should match values accordingly', async () => {
        const feeAddressA = await optionAMMPool.feePoolA()
        const feeAddressB = await optionAMMPool.feePoolB()

        const amountOfStrikeLpNeed = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfStrikeLpToMintOption = scenario.strikePrice.mul(toBigNumber(100)).add(1)
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const initialBuyerBalanceStrikeAsset = toBigNumber(10000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const numberOfOptionsToBuy = toBigNumber(3).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        const balanceBeforeOptionBuyer = await podPut.balanceOf(buyerAddress)
        const balanceBeforeStrikeBuyer = await mockStrikeAsset.balanceOf(buyerAddress)

        const actions = [
          {
            name: 'mint',
            contract: mockStrikeAsset,
            user: lp,
            params: [amountOfStrikeLpNeed.add(amountOfStrikeLpToMintOption)]
          },
          {
            name: 'approve',
            contract: mockStrikeAsset,
            user: lp,
            params: [podPut.address, amountOfStrikeLpToMintOption]
          },
          {
            name: 'mint',
            contract: podPut,
            user: lp,
            params: [amountOfOptionsToMint, lpAddress]
          },
          {
            name: 'approve',
            contract: mockStrikeAsset,
            user: lp,
            params: [optionAMMPool.address, amountOfStrikeLpNeed]
          },
          {
            name: 'approve',
            contract: podPut,
            user: lp,
            params: [optionAMMPool.address, amountOfOptionsToMint]
          },
          {
            name: 'addLiquidity',
            contract: optionAMMPool,
            user: lp,
            params: [amountOfOptionsToMint, amountOfStrikeLpNeed, lpAddress]
          },
          {
            name: 'mint',
            contract: mockStrikeAsset,
            user: buyer,
            params: [initialBuyerBalanceStrikeAsset]
          },
          {
            name: 'approve',
            contract: mockStrikeAsset,
            user: buyer,
            params: [optionAMMPool.address, initialBuyerBalanceStrikeAsset]
          }
        ]

        const fnActions = actions.map(action => {
          const fn = async () => action.contract.connect(action.user)[action.name](...action.params)
          return fn
        })

        for (const fn of fnActions) {
          await fn()
        }

        const buyerStrikeAmountBeforeTrade = await mockStrikeAsset.balanceOf(buyerAddress)

        await optionAMMPool.connect(buyer).tradeExactAOutput(numberOfOptionsToBuy, ethers.constants.MaxUint256, buyerAddress, scenario.initialSigma)

        const buyerStrikeAmountAfterTrade = await mockStrikeAsset.balanceOf(buyerAddress)
        const priceOfTheTrade = buyerStrikeAmountBeforeTrade.sub(buyerStrikeAmountAfterTrade)

        const feesBN = (new BigNumber(priceOfTheTrade.toString()).multipliedBy(new BigNumber(0.00003))).toFixed(0, 2)
        const fees = toBigNumber(feesBN.toString())

        const balanceAfterOptionBuyer = await podPut.balanceOf(buyerAddress)
        const balanceAfterStrikeBuyer = await mockStrikeAsset.balanceOf(buyerAddress)

        const balanceAfterStrikeFeePoolA = await mockStrikeAsset.balanceOf(feeAddressA)
        const balanceAfterStrikeFeePoolB = await mockStrikeAsset.balanceOf(feeAddressB)

        expect(balanceAfterOptionBuyer).to.eq(numberOfOptionsToBuy)
        expect(balanceAfterStrikeFeePoolA).to.eq(balanceAfterStrikeFeePoolB)
        expect(approximately(fees, balanceAfterStrikeFeePoolA.add(balanceAfterStrikeFeePoolB), 5)).to.be.true
      })

      it('should revert if any dependency contract is stopped', async () => {
        const optionLiquidityToAdd = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const stableLiquidityToAdd = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        await addLiquidity(optionAMMPool, optionLiquidityToAdd, stableLiquidityToAdd, lp)

        const optionsToBuy = toBigNumber(3).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const minStableToSell = ethers.constants.MaxUint256
        const amountOfBuyerStable = toBigNumber(10000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        await mockStrikeAsset.connect(buyer).mint(amountOfBuyerStable)
        await mockStrikeAsset.connect(buyer).approve(optionAMMPool.address, amountOfBuyerStable)

        // Stopping just before trade
        const emergencyStop = await ethers.getContractAt(
          'EmergencyStop',
          await configurationManager.getEmergencyStop()
        )
        await emergencyStop.stop(await configurationManager.getPriceProvider())

        await expect(
          optionAMMPool.connect(buyer)
            .tradeExactAOutput(optionsToBuy, minStableToSell, buyerAddress, scenario.initialSigma)
        ).to.be.revertedWith('OptionAMMPool: Pool is stopped')
      })
    })

    describe('tradeExactAInput', () => {
      it('should match values accordingly', async () => {
        const feeAddressA = await optionAMMPool.feePoolA()
        const feeAddressB = await optionAMMPool.feePoolB()

        const amountOfStrikeLpNeed = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfStrikeLpToMintOption = scenario.strikePrice.mul(toBigNumber(100)).add(1)
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const initialBuyerBalanceStrikeAsset = toBigNumber(100).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))

        const amountOfOptionsBuyerToMint = toBigNumber(4).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const amountOfStrikeBuyerToMintOption = scenario.strikePrice.mul(toBigNumber(4)).add(1)
        const numberOfOptionsToSell = toBigNumber(3).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        const balanceBeforeOptionBuyer = await podPut.balanceOf(buyerAddress)
        const balanceBeforeStrikeBuyer = await mockStrikeAsset.balanceOf(buyerAddress)

        const actions = [
          {
            name: 'mint',
            contract: mockStrikeAsset,
            user: lp,
            params: [amountOfStrikeLpNeed.add(amountOfStrikeLpToMintOption)]
          },
          {
            name: 'approve',
            contract: mockStrikeAsset,
            user: lp,
            params: [podPut.address, amountOfStrikeLpToMintOption]
          },
          {
            name: 'mint',
            contract: podPut,
            user: lp,
            params: [amountOfOptionsToMint, lpAddress]
          },
          {
            name: 'approve',
            contract: mockStrikeAsset,
            user: lp,
            params: [optionAMMPool.address, amountOfStrikeLpNeed]
          },
          {
            name: 'approve',
            contract: podPut,
            user: lp,
            params: [optionAMMPool.address, amountOfOptionsToMint]
          },
          {
            name: 'addLiquidity',
            contract: optionAMMPool,
            user: lp,
            params: [amountOfOptionsToMint, amountOfStrikeLpNeed, lpAddress]
          },
          {
            name: 'mint',
            contract: mockStrikeAsset,
            user: buyer,
            params: [amountOfStrikeBuyerToMintOption]
          },
          {
            name: 'approve',
            contract: mockStrikeAsset,
            user: buyer,
            params: [podPut.address, amountOfStrikeBuyerToMintOption]
          },
          {
            name: 'mint',
            contract: podPut,
            user: buyer,
            params: [numberOfOptionsToSell, buyerAddress]
          },
          {
            name: 'approve',
            contract: podPut,
            user: buyer,
            params: [optionAMMPool.address, amountOfOptionsBuyerToMint]
          }

        ]

        const fnActions = actions.map(action => {
          const fn = async () => action.contract.connect(action.user)[action.name](...action.params)
          return fn
        })

        for (const fn of fnActions) {
          await fn()
        }

        const buyerStrikeBeforeTrade = await mockStrikeAsset.balanceOf(buyerAddress)
        const buyerOptionBeforeTrade = await podPut.balanceOf(buyerAddress)

        const [poolOptionAmountBeforeTrade, poolStrikeAmountBeforeTrade] = await optionAMMPool.getPoolBalances()

        await optionAMMPool.connect(buyer).tradeExactAInput(numberOfOptionsToSell, 0, buyerAddress, scenario.initialSigma)

        const buyerOptionAfterBuyer = await podPut.balanceOf(buyerAddress)
        const buyerStrikeAfterBuyer = await mockStrikeAsset.balanceOf(buyerAddress)

        const [poolOptionAmountAfterTrade, poolStrikeAmountAfterTrade] = await optionAMMPool.getPoolBalances()

        expect(buyerOptionAfterBuyer).to.eq(buyerOptionBeforeTrade.sub(numberOfOptionsToSell))
        expect(poolOptionAmountAfterTrade).to.eq(poolOptionAmountBeforeTrade.add(numberOfOptionsToSell))
      })

      it('should revert if any dependency contract is stopped', async () => {
        const optionLiquidityToAdd = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const stableLiquidityToAdd = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        await addLiquidity(optionAMMPool, optionLiquidityToAdd, stableLiquidityToAdd, lp)

        const optionsToSell = toBigNumber(3).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const minStableToBuy = 0
        await mintOptions(podPut, optionsToSell, buyer)
        await podPut.connect(buyer).approve(optionAMMPool.address, optionsToSell)

        // Stopping just before trade
        const emergencyStop = await ethers.getContractAt(
          'EmergencyStop',
          await configurationManager.getEmergencyStop()
        )
        await emergencyStop.stop(await configurationManager.getPriceProvider())

        await expect(
          optionAMMPool.connect(buyer)
            .tradeExactAInput(optionsToSell, minStableToBuy, buyerAddress, scenario.initialSigma)
        ).to.be.revertedWith('OptionAMMPool: Pool is stopped')
      })
    })

    describe('tradeExactBOutput', () => {
      it('should match values accordingly', async () => {
        const amountOfStrikeLpNeed = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfStrikeLpToMintOption = scenario.strikePrice.mul(toBigNumber(100)).add(1)
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        const amountOfOptionsBuyerToMint = toBigNumber(4).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const amountOfStrikeBuyerToMintOption = scenario.strikePrice.mul(toBigNumber(4)).add(1)

        const numberOfOptionsToSell = toBigNumber(3).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        const numberOfTokensToReceive = toBigNumber(1).mul(toBigNumber(10).pow(toBigNumber(scenario.strikeAssetDecimals)))

        const actions = [
          {
            name: 'mint',
            contract: mockStrikeAsset,
            user: lp,
            params: [amountOfStrikeLpNeed.add(amountOfStrikeLpToMintOption)]
          },
          {
            name: 'approve',
            contract: mockStrikeAsset,
            user: lp,
            params: [podPut.address, amountOfStrikeLpToMintOption]
          },
          {
            name: 'mint',
            contract: podPut,
            user: lp,
            params: [amountOfOptionsToMint, lpAddress]
          },
          {
            name: 'approve',
            contract: mockStrikeAsset,
            user: lp,
            params: [optionAMMPool.address, amountOfStrikeLpNeed]
          },
          {
            name: 'approve',
            contract: podPut,
            user: lp,
            params: [optionAMMPool.address, amountOfOptionsToMint]
          },
          {
            name: 'addLiquidity',
            contract: optionAMMPool,
            user: lp,
            params: [amountOfOptionsToMint, amountOfStrikeLpNeed, lpAddress]
          },
          {
            name: 'mint',
            contract: mockStrikeAsset,
            user: buyer,
            params: [amountOfStrikeBuyerToMintOption]
          },
          {
            name: 'approve',
            contract: mockStrikeAsset,
            user: buyer,
            params: [podPut.address, amountOfStrikeBuyerToMintOption]
          },
          {
            name: 'mint',
            contract: podPut,
            user: buyer,
            params: [numberOfOptionsToSell, buyerAddress]
          },
          {
            name: 'approve',
            contract: podPut,
            user: buyer,
            params: [optionAMMPool.address, amountOfOptionsBuyerToMint]
          }

        ]

        const fnActions = actions.map(action => {
          const fn = async () => action.contract.connect(action.user)[action.name](...action.params)
          return fn
        })

        for (const fn of fnActions) {
          await fn()
        }

        const buyerStrikeBeforeTrade = await mockStrikeAsset.balanceOf(buyerAddress)
        const buyerOptionBeforeTrade = await podPut.balanceOf(buyerAddress)

        const [poolOptionAmountBeforeTrade, poolStrikeAmountBeforeTrade] = await optionAMMPool.getPoolBalances()

        await optionAMMPool.connect(buyer).tradeExactBOutput(numberOfTokensToReceive, ethers.constants.MaxUint256, buyerAddress, scenario.initialSigma)

        const buyerOptionAfterBuyer = await podPut.balanceOf(buyerAddress)
        const buyerStrikeAfterBuyer = await mockStrikeAsset.balanceOf(buyerAddress)

        const [poolOptionAmountAfterTrade, poolStrikeAmountAfterTrade] = await optionAMMPool.getPoolBalances()

        const feesBN = (new BigNumber(numberOfTokensToReceive.toString()).multipliedBy(new BigNumber(0.00003))).toFixed(0, 2)
        const fees = toBigNumber(feesBN.toString())

        expect(poolStrikeAmountBeforeTrade).to.eq(poolStrikeAmountAfterTrade.add(numberOfTokensToReceive).add(fees))
        expect(buyerStrikeBeforeTrade).to.eq(buyerStrikeAfterBuyer.sub(numberOfTokensToReceive))

        // Testing Remove Liquidity
        await optionAMMPool.connect(lp).removeLiquidity(100, 100)

        const [poolOptionAmountAfterRemove, poolStrikeAmountAfterRemove] = await optionAMMPool.getPoolBalances()

        expect(poolOptionAmountAfterRemove).to.eq(0)
        expect(poolStrikeAmountAfterRemove).to.eq(1)
      })

      it('should revert if any dependency contract is stopped', async () => {
        const optionLiquidityToAdd = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const stableLiquidityToAdd = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        await addLiquidity(optionAMMPool, optionLiquidityToAdd, stableLiquidityToAdd, lp)

        const stableToBuy = toBigNumber(1).mul(toBigNumber(10).pow(toBigNumber(scenario.strikeAssetDecimals)))
        const maxOptionsToSell = ethers.constants.MaxUint256
        const amountOfBuyerOptions = toBigNumber(3).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        await mintOptions(podPut, amountOfBuyerOptions, buyer)
        await podPut.connect(buyer).approve(optionAMMPool.address, amountOfBuyerOptions)

        // Stopping just before trade
        const emergencyStop = await ethers.getContractAt(
          'EmergencyStop',
          await configurationManager.getEmergencyStop()
        )
        await emergencyStop.stop(await configurationManager.getPriceProvider())

        await expect(
          optionAMMPool.connect(buyer)
            .tradeExactBOutput(stableToBuy, maxOptionsToSell, buyerAddress, scenario.initialSigma)
        ).to.be.revertedWith('OptionAMMPool: Pool is stopped')
      })
    })

    describe('tradeExactBInput', () => {
      it('should match values accordingly', async () => {
        const amountOfStrikeLpNeed = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfStrikeLpToMintOption = scenario.strikePrice.mul(toBigNumber(100)).add(1)
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        const amountOfOptionsBuyerToMint = toBigNumber(4).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const amountOfStrikeBuyerToMintOption = scenario.strikePrice.mul(toBigNumber(4)).add(1)

        const numberOfTokensToSend = toBigNumber(1).mul(toBigNumber(10).pow(toBigNumber(scenario.strikeAssetDecimals)))

        const actions = [
          {
            name: 'mint',
            contract: mockStrikeAsset,
            user: lp,
            params: [amountOfStrikeLpNeed.add(amountOfStrikeLpToMintOption)]
          },
          {
            name: 'approve',
            contract: mockStrikeAsset,
            user: lp,
            params: [podPut.address, amountOfStrikeLpToMintOption]
          },
          {
            name: 'mint',
            contract: podPut,
            user: lp,
            params: [amountOfOptionsToMint, lpAddress]
          },
          {
            name: 'approve',
            contract: mockStrikeAsset,
            user: lp,
            params: [optionAMMPool.address, amountOfStrikeLpNeed]
          },
          {
            name: 'approve',
            contract: podPut,
            user: lp,
            params: [optionAMMPool.address, amountOfOptionsToMint]
          },
          {
            name: 'addLiquidity',
            contract: optionAMMPool,
            user: lp,
            params: [amountOfOptionsToMint, amountOfStrikeLpNeed, lpAddress]
          },
          {
            name: 'mint',
            contract: mockStrikeAsset,
            user: buyer,
            params: [amountOfStrikeBuyerToMintOption]
          },
          {
            name: 'approve',
            contract: mockStrikeAsset,
            user: buyer,
            params: [optionAMMPool.address, ethers.constants.MaxUint256]
          }

        ]

        const fnActions = actions.map(action => {
          const fn = async () => action.contract.connect(action.user)[action.name](...action.params)
          return fn
        })

        for (const fn of fnActions) {
          await fn()
        }

        const buyerStrikeBeforeTrade = await mockStrikeAsset.balanceOf(buyerAddress)
        const buyerOptionBeforeTrade = await podPut.balanceOf(buyerAddress)

        const [poolOptionAmountBeforeTrade, poolStrikeAmountBeforeTrade] = await optionAMMPool.getPoolBalances()

        await optionAMMPool.connect(buyer).tradeExactBInput(numberOfTokensToSend, 0, buyerAddress, scenario.initialSigma)

        const buyerOptionAfterBuyer = await podPut.balanceOf(buyerAddress)
        const buyerStrikeAfterBuyer = await mockStrikeAsset.balanceOf(buyerAddress)

        const [poolOptionAmountAfterTrade, poolStrikeAmountAfterTrade] = await optionAMMPool.getPoolBalances()

        expect(buyerStrikeAfterBuyer).to.eq(buyerStrikeBeforeTrade.sub(numberOfTokensToSend))
      })

      it('should revert if any dependency contract is stopped', async () => {
        const optionLiquidityToAdd = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const stableLiquidityToAdd = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        await addLiquidity(optionAMMPool, optionLiquidityToAdd, stableLiquidityToAdd, lp)

        const stableToSell = toBigNumber(1).mul(toBigNumber(10).pow(toBigNumber(scenario.strikeAssetDecimals)))
        const minOptionsToBuy = 0
        await mockStrikeAsset.connect(buyer).mint(stableToSell)
        await mockStrikeAsset.connect(buyer).approve(optionAMMPool.address, stableToSell)

        // Stopping just before trade
        const emergencyStop = await ethers.getContractAt(
          'EmergencyStop',
          await configurationManager.getEmergencyStop()
        )
        await emergencyStop.stop(await configurationManager.getPriceProvider())

        await expect(
          optionAMMPool.connect(buyer)
            .tradeExactBInput(stableToSell, minOptionsToBuy, buyerAddress, scenario.initialSigma)
        ).to.be.revertedWith('OptionAMMPool: Pool is stopped')
      })
    })
  })
})
