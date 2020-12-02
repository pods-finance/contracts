const { expect } = require('chai')
const BigNumber = require('bignumber.js')
const forceExpiration = require('../util/forceExpiration')
const forceEndOfExerciseWindow = require('../util/forceEndOfExerciseWindow')
const getTimestamp = require('../util/getTimestamp')
const deployBlackScholes = require('../util/deployBlackScholes')
const getPriceProviderMock = require('../util/getPriceProviderMock')
const createNewOption = require('../util/createNewOption')
const createNewPool = require('../util/createNewPool')
const createOptionFactory = require('../util/createOptionFactory')
const { toBigNumber, approximately } = require('../../utils/utils')

const OPTION_TYPE_PUT = 0
const OPTION_TYPE_CALL = 1
const EXERCISE_TYPE_EUROPEAN = 0

const scenarios = [
  {
    name: 'WBTC/USDC',
    optionType: OPTION_TYPE_PUT,
    underlyingAssetSymbol: 'WBTC',
    underlyingAssetDecimals: 18,
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
    expectedNewIV: toBigNumber(0.66615e18)
  }
  // {
  //   name: 'WBTC/USDC',
  //   optionType: OPTION_TYPE_CALL,
  //   underlyingAssetSymbol: 'WBTC',
  //   underlyingAssetDecimals: 18,
  //   expiration: 60 * 60 * 24 * 7, // 7 days
  //   strikeAssetSymbol: 'USDC',
  //   strikeAssetDecimals: 6,
  //   strikePrice: toBigNumber(17000e6),
  //   strikePriceDecimals: 6,
  //   amountToMint: ethers.BigNumber.from(1e8.toString()),
  //   amountToMintTooLow: 1,
  //   amountOfStableToAddLiquidity: ethers.BigNumber.from(1e8.toString()),
  //   initialFImp: ethers.BigNumber.from('10').pow(54),
  //   initialSpotPrice: toBigNumber(18000e8),
  //   spotPriceDecimals: 8,
  //   initialSigma: toBigNumber(0.661e18),
  //   expectedNewIV: toBigNumber(0.66615e18)
  // }
]

scenarios.forEach(scenario => {
  describe('OptionAMMPool.sol - ' + scenario.name, () => {
    const TEN = ethers.BigNumber.from('10')
    let mockUnderlyingAsset
    let mockStrikeAsset
    let factoryContract
    let optionAMMFactory
    let priceProviderMock
    let blackScholes
    let sigma
    let podPut
    let podPutAddress
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

    async function MintPhase (amountOfOptionsToMint, signer = deployer, owner = deployerAddress) {
      const amountToMintBN = ethers.BigNumber.from(amountOfOptionsToMint)
      const optionsDecimals = await podPut.decimals()
      await mockStrikeAsset.connect(signer).approve(podPut.address, ethers.constants.MaxUint256)
      // calculate amount of Strike necessary to mint
      await mockStrikeAsset.connect(signer).mint(scenario.strikePrice.mul(amountOfOptionsToMint).add(1))

      await podPut.connect(signer).mint(amountToMintBN.mul(toBigNumber(10).pow(optionsDecimals)), owner)
    }

    async function mintAndAddLiquidity (optionsAmount, stableAmount, signer = deployer, owner = deployerAddress) {
      const optionWithDecimals = ethers.BigNumber.from(optionsAmount).mul(TEN.pow(scenario.underlyingAssetDecimals))
      await MintPhase(optionsAmount, signer, owner)
      await mockStrikeAsset.connect(signer).mint(stableAmount)
      // Approve both Option and Stable Token
      await mockStrikeAsset.connect(signer).approve(optionAMMPool.address, ethers.constants.MaxUint256)
      await podPut.connect(signer).approve(optionAMMPool.address, ethers.constants.MaxUint256)

      const optionsDecimals = await podPut.decimals()
      const stableDecimals = await mockStrikeAsset.decimals()
      await optionAMMPool.connect(signer).addLiquidity(scenario.amountOfStableToAddLiquidity, optionWithDecimals)
    }

    beforeEach(async function () {
      let MockERC20, MockWETH, Sigma, OptionAMMFactory
      [deployer, second, buyer, delegator, lp] = await ethers.getSigners()
      deployerAddress = await deployer.getAddress()
      secondAddress = await second.getAddress()
      buyerAddress = await buyer.getAddress()
      delegatorAddress = await delegator.getAddress()
      lpAddress = await lp.getAddress()

      // 1) Deploy Option
      // 2) Use same strike Asset
      ;[MockERC20, MockWETH, blackScholes, Sigma, OptionAMMFactory] = await Promise.all([
        ethers.getContractFactory('MintableERC20'),
        ethers.getContractFactory('WETH'),
        deployBlackScholes(),
        ethers.getContractFactory('Sigma'),
        ethers.getContractFactory('OptionAMMFactory')
      ])

      const mockWeth = await MockWETH.deploy()
      sigma = await Sigma.deploy(blackScholes.address)

      ;[factoryContract, mockUnderlyingAsset, mockStrikeAsset, optionAMMFactory] = await Promise.all([
        createOptionFactory(mockWeth.address),
        MockERC20.deploy(scenario.underlyingAssetSymbol, scenario.underlyingAssetSymbol, scenario.underlyingAssetDecimals),
        MockERC20.deploy(scenario.strikeAssetSymbol, scenario.strikeAssetSymbol, scenario.strikeAssetDecimals),
        OptionAMMFactory.deploy()
      ])
      // Deploy option
      const currentBlocktimestamp = await getTimestamp()
      podPut = await createNewOption(deployerAddress, factoryContract, 'pod:WBTC:USDC:5000:A',
        'pod:WBTC:USDC:5000:A',
        scenario.optionType,
        EXERCISE_TYPE_EUROPEAN,
        mockUnderlyingAsset.address,
        mockStrikeAsset.address,
        scenario.strikePrice,
        currentBlocktimestamp + scenario.expiration,
        24 * 60 * 60)

      const mock = await getPriceProviderMock(deployer, scenario.initialSpotPrice, scenario.spotPriceDecimals, mockUnderlyingAsset.address)
      priceProviderMock = mock.priceProvider
      // 1) Deploy optionAMMPool
      optionAMMPool = await createNewPool(deployerAddress, optionAMMFactory, podPut.address, mockStrikeAsset.address, priceProviderMock.address, blackScholes.address, sigma.address, scenario.initialSigma)
    })

    describe('Constructor/Initialization checks', () => {
      it('should have correct option data (strikePrice, expiration, strikeAsset)', async () => {
        expect(await optionAMMPool.tokenB()).to.equal(mockStrikeAsset.address)
        expect(await optionAMMPool.tokenA()).to.equal(podPut.address)
        expect(await optionAMMPool.priceProvider()).to.equal(priceProviderMock.address)

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
        await expect(optionAMMPool.connect(buyer).tradeExactBOutput(0, ethers.constants.MaxUint256, buyerAddress, scenario.initialSigma)).to.be.revertedWith('Option has expired')
      })
      it('should not allow add liquidity after option expiration', async () => {
        const expiration = await podPut.expiration()
        await forceExpiration(podPut, parseInt(expiration.toString()))
        await expect(optionAMMPool.connect(buyer).addLiquidity(0, 0, buyerAddress)).to.be.revertedWith('Option has expired')
      })
    })

    describe('Reading functions', () => {
      it('should return the ABPrice', async () => {
        await expect(optionAMMPool.getABPrice()).to.not.be.reverted
      })
    })

    describe('Add Liquidity', () => {
      it('should revert if user dont supply liquidity of both assets', async () => {
        await expect(optionAMMPool.addLiquidity(0, 10000)).to.be.revertedWith('ou should add both tokens on the first liquidity')
      })

      it('should revert if user ask more assets to it has in balance', async () => {
        await expect(optionAMMPool.addLiquidity(1000, 10000)).to.be.revertedWith('ERC20: transfer amount exceeds balance')
      })

      it('should revert if user do not approved one of assets to be spent by OptionAMMPool', async () => {
        // Mint option and Stable asset to the liquidity adder
        await MintPhase(1)
        await mockStrikeAsset.mint(scenario.amountOfStableToAddLiquidity.add(1))
        const optionBalance = await podPut.balanceOf(deployerAddress)
        await expect(optionAMMPool.addLiquidity(scenario.amountOfStableToAddLiquidity, optionBalance.toString())).to.be.revertedWith('ERC20: transfer amount exceeds allowance')
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

        await optionAMMPool.connect(lp).removeLiquidity(amountOfOptionsToMint, amountOfStrikeLpNeed)

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
        await optionAMMPool.connect(lp).removeLiquidity(amountOfOptionsToMint, amountOfStrikeLpNeed)
      })
    })
  })
})
