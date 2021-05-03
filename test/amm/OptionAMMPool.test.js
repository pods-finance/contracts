const { expect } = require('chai')
const BigNumber = require('bignumber.js')
const skipToWithdrawWindow = require('../util/skipToWithdrawWindow')
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
const EXERCISE_TYPE_AMERICAN = 1

const scenarios = [
  {
    name: 'PUT WBTC/USDC',
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
    emittedSpotPrice: toBigNumber(18000e18),
    spotPriceDecimals: 8,
    initialSigma: toBigNumber(0.661e18),
    expectedNewIV: toBigNumber(0.66615e18),
    cap: ethers.BigNumber.from(2000000e6.toString())
  },
  {
    name: 'CALL WBTC/USDC',
    optionType: OPTION_TYPE_CALL,
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
    emittedSpotPrice: toBigNumber(18000e18),
    spotPriceDecimals: 8,
    initialSigma: toBigNumber(2 * 1e18),
    expectedNewIV: toBigNumber(1.2 * 1e18),
    cap: ethers.BigNumber.from(2000000e6.toString())
  }
]

scenarios.forEach(scenario => {
  describe('OptionAMMPool.sol - ' + scenario.name, () => {
    let MockERC20, WETH, OptionAMMFactory, OptionAMMPool, PriceProvider
    let weth
    let configurationManager
    let mockUnderlyingAsset
    let mockStrikeAsset
    let factoryContract
    let optionAMMFactory
    let priceProvider
    let option
    let optionAMMPool
    let deployer, second, buyer, delegator, lp
    let deployerAddress, secondAddress, buyerAddress, delegatorAddress, lpAddress
    let defaultPriceFeed

    before(async () => {
      ;[deployer, second, buyer, delegator, lp] = await ethers.getSigners()

      ;[deployerAddress, secondAddress, buyerAddress, delegatorAddress, lpAddress] = await Promise.all([
        deployer.getAddress(),
        second.getAddress(),
        buyer.getAddress(),
        delegator.getAddress(),
        lp.getAddress()
      ])

      ;[MockERC20, WETH, OptionAMMFactory, OptionAMMPool, PriceProvider] = await Promise.all([
        ethers.getContractFactory('MintableERC20'),
        ethers.getContractFactory('WETH'),
        ethers.getContractFactory('OptionAMMFactory'),
        ethers.getContractFactory('OptionAMMPool'),
        ethers.getContractFactory('PriceProvider')
      ])

      ;[weth, mockUnderlyingAsset, mockStrikeAsset] = await Promise.all([
        WETH.deploy(),
        MockERC20.deploy(scenario.underlyingAssetSymbol, scenario.underlyingAssetSymbol, scenario.underlyingAssetDecimals),
        MockERC20.deploy(scenario.strikeAssetSymbol, scenario.strikeAssetSymbol, scenario.strikeAssetDecimals)
      ])
      defaultPriceFeed = await createPriceFeedMock(deployer)
    })

    beforeEach(async function () {
      configurationManager = await createConfigurationManager()
      await defaultPriceFeed.setDecimals(scenario.spotPriceDecimals)
      await defaultPriceFeed.setRoundData({
        roundId: 1,
        answer: scenario.initialSpotPrice,
        startedAt: await getTimestamp(),
        updatedAt: await getTimestamp() + 1,
        answeredInRound: 1
      })
      priceProvider = await PriceProvider.deploy(configurationManager.address, [mockUnderlyingAsset.address], [defaultPriceFeed.contract.address])
      await configurationManager.setPriceProvider(priceProvider.address)

      factoryContract = await createOptionFactory(weth.address, configurationManager)

      option = await createMockOption({
        underlyingAsset: mockUnderlyingAsset.address,
        strikeAsset: mockStrikeAsset.address,
        strikePrice: scenario.strikePrice,
        configurationManager,
        optionType: scenario.optionType
      })

      optionAMMFactory = await OptionAMMFactory.deploy(configurationManager.address)
      optionAMMPool = await createNewPool(deployerAddress, optionAMMFactory, option.address, mockStrikeAsset.address, scenario.initialSigma)
    })

    describe('Constructor/Initialization checks', () => {
      it('should have correct option data (strikePrice, expiration, strikeAsset)', async () => {
        expect(await optionAMMPool.tokenB()).to.equal(mockStrikeAsset.address)
        expect(await optionAMMPool.tokenA()).to.equal(option.address)

        const optionExpiration = await option.expiration()
        const optionStrikePrice = await option.strikePrice()
        const optionStrikePriceDecimals = await option.strikePriceDecimals()
        const priceProperties = await optionAMMPool.priceProperties()
        const bsDecimals = await optionAMMPool.PRICING_DECIMALS()

        expect(priceProperties.expiration).to.equal(optionExpiration)
        expect(priceProperties.strikePrice).to.equal(optionStrikePrice.mul(toBigNumber(10).pow(bsDecimals.sub(optionStrikePriceDecimals))))
      })

      it('should not allow trade after option expiration', async () => {
        await skipToWithdrawWindow(option)
        await expect(
          optionAMMPool.connect(buyer).tradeExactBOutput(0, ethers.constants.MaxUint256, buyerAddress, scenario.initialSigma)
        ).to.be.revertedWith('Pool: exercise window has started')
      })

      it('should revert when trying to deploy a Pool with strikeAsset decimals > PRICING_DECIMALS', async () => {
        const mockTokenB = await MockERC20.deploy('TEST', 'TEST', '16')
        const mockStrikeAssetB = await MockERC20.deploy('TEST', 'TEST', '20')
        option = await createMockOption({
          underlyingAsset: mockUnderlyingAsset.address,
          strikeAsset: mockStrikeAssetB.address,
          strikePrice: scenario.strikePrice,
          configurationManager
        })

        optionAMMPool = createNewPool(deployerAddress, optionAMMFactory, option.address, mockTokenB.address, scenario.initialSigma)
        await expect(optionAMMPool).to.be.revertedWith('Pool: invalid strikePrice unit')
      })

      it('should revert when trying to deploy a Pool with tokenB decimals > PRICING_DECIMALS', async () => {
        option = await createMockOption({
          underlyingAsset: mockUnderlyingAsset.address,
          strikeAsset: mockStrikeAsset.address,
          strikePrice: scenario.strikePrice,
          configurationManager
        })
        const mockTokenB = await MockERC20.deploy('TEST', 'TEST', '20')
        optionAMMPool = createNewPool(deployerAddress, optionAMMFactory, option.address, mockTokenB.address, scenario.initialSigma)
        await expect(optionAMMPool).to.be.revertedWith('Pool: invalid tokenB unit')
      })

      it('should not allow add liquidity after option expiration', async () => {
        await skipToWithdrawWindow(option)
        await expect(
          optionAMMPool.connect(buyer).addLiquidity(0, 0, buyerAddress)
        ).to.be.revertedWith('Pool: exercise window has started')
      })

      it('should not create a pool with fee pools that are non-contracts', async () => {
        const tx = OptionAMMPool.deploy(
          option.address,
          mockStrikeAsset.address,
          scenario.initialSigma,
          buyerAddress,
          buyerAddress,
          configurationManager.address
        )
        await expect(tx).to.be.revertedWith('Pool: Invalid fee pools')
      })

      it('should not create a pool with American options', async () => {
        const americanOption = await createMockOption({
          underlyingAsset: mockUnderlyingAsset.address,
          strikeAsset: mockStrikeAsset.address,
          strikePrice: scenario.strikePrice,
          exerciseType: EXERCISE_TYPE_AMERICAN,
          exerciseWindow: 0,
          configurationManager
        })

        const tx = createNewPool(deployerAddress, optionAMMFactory, americanOption.address, mockStrikeAsset.address, scenario.initialSigma)
        await expect(tx).to.be.revertedWith('Pool: invalid exercise type')
      })
    })

    describe('Reading functions', () => {
      it('should return the ABPrice', async () => {
        await expect(optionAMMPool.getABPrice()).to.not.be.reverted
      })
    })

    describe('Add Liquidity', () => {
      it('should revert if user dont supply liquidity of both assets', async () => {
        await expect(optionAMMPool.addLiquidity(0, 0, buyerAddress)).to.be.revertedWith('AMM: invalid first liquidity')
      })

      it('should revert if user ask more assets to it has in balance', async () => {
        await expect(
          optionAMMPool.addLiquidity(1000, 10000, buyerAddress)
        ).to.be.reverted
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

        await mintOptions(option, scenario.amountToMint, deployer)

        await mockStrikeAsset.mint(scenario.amountOfStableToAddLiquidity)
        await mockStrikeAsset.approve(optionAMMPool.address, scenario.amountOfStableToAddLiquidity)
        await option.approve(optionAMMPool.address, scenario.amountToMint)

        await expect(
          optionAMMPool.addLiquidity(scenario.amountToMint, scenario.amountOfStableToAddLiquidity, deployerAddress)
        ).to.be.revertedWith('Pool: Pool is stopped')
      })

      it('should revert if add liquidity when the option price is zero', async () => {
        const podPut = await createMockOption({
          underlyingAsset: mockUnderlyingAsset.address,
          strikeAsset: mockStrikeAsset.address,
          strikePrice: scenario.strikePrice,
          configurationManager
        })

        optionAMMPool = await createNewPool(deployerAddress, optionAMMFactory, podPut.address, mockStrikeAsset.address, toBigNumber(0.261e18))

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

        const startOfExerciseWindow = await podPut.startOfExerciseWindow()

        const nearExpiration = startOfExerciseWindow - 60 * 60 * 2 // 2 hours before expiration
        await ethers.provider.send('evm_mine', [nearExpiration])
        await defaultPriceFeed.setUpdateAt(await getTimestamp())

        await expect(optionAMMPool.addLiquidity(1000, 10000, lpAddress)).to.be.revertedWith('AMM: option price zero')
      })

      it('logs the spot price and iv', async () => {
        const amountOfStrikeLpNeed = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        await mintOptions(option, amountOfOptionsToMint, lp)
        await option.connect(lp).approve(optionAMMPool.address, amountOfOptionsToMint)

        await mockStrikeAsset.connect(lp).mint(amountOfStrikeLpNeed)
        await mockStrikeAsset.connect(lp).approve(optionAMMPool.address, amountOfStrikeLpNeed)

        const addition = optionAMMPool.connect(lp).addLiquidity(amountOfOptionsToMint, amountOfStrikeLpNeed, lpAddress)

        await expect(addition).to.emit(optionAMMPool, 'TradeInfo')
          .withArgs(scenario.emittedSpotPrice, scenario.initialSigma)
      })
    })

    describe('Remove Liquidity', () => {
      it('should remove all amount after simple addition', async () => {
        const amountOfStrikeLpNeed = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfStrikeLpToMintOption = scenario.strikePrice.mul(toBigNumber(100)).add(1)
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const initialBuyerBalanceStrikeAsset = toBigNumber(10000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const numberOfOptionsToBuy = toBigNumber(3).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        const balanceBeforeOptionBuyer = await option.balanceOf(buyerAddress)
        const balanceBeforeStrikeBuyer = await mockStrikeAsset.balanceOf(buyerAddress)

        await addLiquidity(optionAMMPool, amountOfOptionsToMint, amountOfStrikeLpNeed, lp)

        const feeAddressA = await optionAMMPool.feePoolA()
        const feeAddressB = await optionAMMPool.feePoolB()

        const lpOptionBeforeTrade = await option.balanceOf(lpAddress)
        const lpStrikeBeforeTrade = await mockStrikeAsset.balanceOf(lpAddress)

        const withdrawObj = await optionAMMPool.connect(lp).getRemoveLiquidityAmounts(100, 100, lpAddress)

        const removal = optionAMMPool.connect(lp).removeLiquidity(100, 100)

        await expect(removal).to.emit(optionAMMPool, 'TradeInfo')
          .withArgs(scenario.emittedSpotPrice, scenario.initialSigma)

        const lpOptionAfterBuyer = await option.balanceOf(lpAddress)
        const lpStrikeAfterBuyer = await mockStrikeAsset.balanceOf(lpAddress)

        expect(lpOptionAfterBuyer.sub(lpOptionBeforeTrade)).to.eq(withdrawObj.withdrawAmountA)
        expect(lpStrikeAfterBuyer.sub(lpStrikeBeforeTrade)).to.eq(withdrawObj.withdrawAmountB)

        const [poolOptionAmountAfterTrade, poolStrikeAmountAfterTrade] = await optionAMMPool.getPoolBalances()

        expect(poolOptionAmountAfterTrade).to.eq(0)
        expect(poolStrikeAmountAfterTrade).to.eq(0)
        expect(lpStrikeAfterBuyer).to.eq(lpStrikeAfterBuyer)

        const feePoolABalanceAfterStrike = await mockStrikeAsset.balanceOf(feeAddressA)
        const feePoolBBalanceAfterStrike = await mockStrikeAsset.balanceOf(feeAddressB)

        expect(feePoolABalanceAfterStrike).to.eq(0)
        expect(feePoolBBalanceAfterStrike).to.eq(0)
      })

      it('should revert if any dependency contract is stopped', async () => {
        const emergencyStop = await ethers.getContractAt(
          'EmergencyStop',
          await configurationManager.getEmergencyStop()
        )

        await mintOptions(option, scenario.amountToMint, deployer)

        await mockStrikeAsset.mint(scenario.amountOfStableToAddLiquidity)
        await mockStrikeAsset.approve(optionAMMPool.address, scenario.amountOfStableToAddLiquidity)
        await option.approve(optionAMMPool.address, scenario.amountToMint)

        await optionAMMPool.addLiquidity(scenario.amountToMint, scenario.amountOfStableToAddLiquidity, deployerAddress)

        await emergencyStop.stop(await configurationManager.getPriceProvider())

        await expect(
          optionAMMPool.removeLiquidity(scenario.amountToMint, scenario.amountOfStableToAddLiquidity)
        ).to.be.revertedWith('Pool: Pool is stopped')
      })

      it('should remove liquidity when option price is rounded to zero', async () => {
        const amountOfStrikeLpNeed = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfStrikeLpToMintOption = scenario.strikePrice.mul(toBigNumber(100)).add(1)
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const initialBuyerBalanceStrikeAsset = toBigNumber(10000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const numberOfOptionsToBuy = toBigNumber(3).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        const balanceBeforeOptionBuyer = await option.balanceOf(buyerAddress)
        const balanceBeforeStrikeBuyer = await mockStrikeAsset.balanceOf(buyerAddress)

        await addLiquidity(optionAMMPool, amountOfOptionsToMint, amountOfStrikeLpNeed, lp)

        const feeAddressA = await optionAMMPool.feePoolA()
        const feeAddressB = await optionAMMPool.feePoolB()

        const lpStrikeBeforeTrade = await mockStrikeAsset.balanceOf(lpAddress)
        const lpOptionBeforeTrade = await option.balanceOf(lpAddress)

        const [poolOptionAmountBeforeTrade, poolStrikeAmountBeforeTrade] = await optionAMMPool.getPoolBalances()

        // fast forward until very close to the maturity
        const expiration = await option.expiration()

        const nearExpiration = expiration - 60 * 60 * 2 // 2 hours before expiration
        await ethers.provider.send('evm_mine', [nearExpiration])
        await defaultPriceFeed.setUpdateAt(await getTimestamp())

        await optionAMMPool.connect(lp).removeLiquidity(100, 100)

        const lpOptionAfterBuyer = await option.balanceOf(lpAddress)
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

        const balanceBeforeOptionBuyer = await option.balanceOf(buyerAddress)
        const balanceBeforeStrikeBuyer = await mockStrikeAsset.balanceOf(buyerAddress)

        await addLiquidity(optionAMMPool, amountOfOptionsToMint, amountOfStrikeLpNeed, lp)

        const feeAddressA = await optionAMMPool.feePoolA()
        const feeAddressB = await optionAMMPool.feePoolB()

        const lpStrikeBeforeTrade = await mockStrikeAsset.balanceOf(lpAddress)
        const lpOptionBeforeTrade = await option.balanceOf(lpAddress)

        const [poolOptionAmountBeforeTrade, poolStrikeAmountBeforeTrade] = await optionAMMPool.getPoolBalances()

        await skipToWithdrawWindow(option)

        await defaultPriceFeed.setUpdateAt(await getTimestamp())

        await optionAMMPool.connect(lp).removeLiquidity(100, 100)

        const lpOptionAfterBuyer = await option.balanceOf(lpAddress)
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

        const balanceBeforeOptionBuyer = await option.balanceOf(buyerAddress)
        const balanceBeforeStrikeBuyer = await mockStrikeAsset.balanceOf(buyerAddress)

        await addLiquidity(optionAMMPool, amountOfOptionsToMint, amountOfStrikeLpNeed, lp)

        const feeAddressA = await optionAMMPool.feePoolA()
        const feeAddressB = await optionAMMPool.feePoolB()

        const lpStrikeBeforeTrade = await mockStrikeAsset.balanceOf(lpAddress)
        const lpOptionBeforeTrade = await option.balanceOf(lpAddress)

        const [poolOptionAmountBeforeTrade, poolStrikeAmountBeforeTrade] = await optionAMMPool.getPoolBalances()

        await optionAMMPool.connect(lp).removeLiquidity(100, 0)

        await optionAMMPool.connect(lp).removeLiquidity(0, 100)

        const lpOptionAfterBuyer = await option.balanceOf(lpAddress)
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
        const podPut = await createMockOption({
          underlyingAsset: mockUnderlyingAsset.address,
          strikeAsset: mockStrikeAsset.address,
          strikePrice: scenario.strikePrice,
          configurationManager
        })

        optionAMMPool = await createNewPool(deployerAddress, optionAMMFactory, podPut.address, mockStrikeAsset.address, toBigNumber(0.161e18))
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

        // skip to 60 seconds before exercise window
        const startOfExerciseWindow = await podPut.startOfExerciseWindow()
        await ethers.provider.send('evm_mine', [parseInt((startOfExerciseWindow - 60 * 1).toString())])
        await defaultPriceFeed.setUpdateAt(await getTimestamp())

        await expect(optionAMMPool.connect(buyer).tradeExactAOutput(numberOfOptionsToBuy, ethers.constants.MaxUint256, buyerAddress, scenario.initialSigma)).to.be.revertedWith('AMM: invalid amountBIn')

        await expect(optionAMMPool.connect(buyer).tradeExactAInput(numberOfOptionsToBuy, ethers.constants.MaxUint256, buyerAddress, scenario.initialSigma)).to.be.revertedWith('AMM: invalid amountBOut')

        await expect(optionAMMPool.connect(buyer).tradeExactBOutput(numberOfOptionsToBuy, ethers.constants.MaxUint256, buyerAddress, scenario.initialSigma)).to.be.revertedWith('AMM: invalid amountAIn')

        await expect(optionAMMPool.connect(buyer).tradeExactBInput(numberOfOptionsToBuy, ethers.constants.MaxUint256, buyerAddress, scenario.initialSigma)).to.be.revertedWith('AMM: invalid amountAOut')
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
        const numberOfOptionsToBuy = toBigNumber(1).mul(toBigNumber(10).pow(5))

        await addLiquidity(optionAMMPool, amountOfOptionsToMint, amountOfStrikeLpNeed, lp)

        // Minting tokenB to sell
        await mockStrikeAsset.connect(buyer).mint(initialBuyerBalanceStrikeAsset)
        await mockStrikeAsset.connect(buyer).approve(optionAMMPool.address, initialBuyerBalanceStrikeAsset)

        const buyerStrikeAmountBeforeTrade = await mockStrikeAsset.balanceOf(buyerAddress)
        const tradeDetails = await optionAMMPool.getOptionTradeDetailsExactAOutput(numberOfOptionsToBuy)

        await expect(optionAMMPool.connect(buyer).tradeExactAOutput(numberOfOptionsToBuy, 1, buyerAddress, scenario.initialSigma)).to.be.revertedWith('AMM: slippage not acceptable')

        const trade = optionAMMPool.connect(buyer)
          .tradeExactAOutput(numberOfOptionsToBuy, ethers.constants.MaxUint256, buyerAddress, scenario.initialSigma)

        await expect(trade).to.emit(optionAMMPool, 'TradeInfo')
          .withArgs(scenario.emittedSpotPrice, scenario.initialSigma)

        const buyerStrikeAmountAfterTrade = await mockStrikeAsset.balanceOf(buyerAddress)
        const tokensSpent = buyerStrikeAmountBeforeTrade.sub(buyerStrikeAmountAfterTrade)
        expect(tradeDetails.amountBIn).to.be.equal(tokensSpent)

        const feesBN = (new BigNumber(tokensSpent.toString()).multipliedBy(new BigNumber(0.03))).toFixed(0, 2)
        const fees = toBigNumber(feesBN.toString())
        const feeContractA = await ethers.getContractAt('FeePool', feeAddressA)
        const feeContractB = await ethers.getContractAt('FeePool', feeAddressB)

        const feesAPortion = await feeContractA.feeValue()
        const feesBPortion = await feeContractB.feeValue()

        const balanceAfterOptionBuyer = await option.balanceOf(buyerAddress)

        const balanceAfterStrikeFeePoolA = await mockStrikeAsset.balanceOf(feeAddressA)
        const balanceAfterStrikeFeePoolB = await mockStrikeAsset.balanceOf(feeAddressB)

        expect(balanceAfterOptionBuyer).to.eq(numberOfOptionsToBuy)
        expect(balanceAfterStrikeFeePoolB).to.eq(balanceAfterStrikeFeePoolA.mul(feesBPortion).div(feesAPortion))
        expect(approximately(fees, balanceAfterStrikeFeePoolA.add(balanceAfterStrikeFeePoolB), 8)).to.be.true
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
        ).to.be.revertedWith('Pool: Pool is stopped')
      })
    })

    describe('tradeExactAInput', () => {
      it('should match values accordingly', async () => {
        const amountOfStrikeLpNeed = toBigNumber(60000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfStrikeLpToMintOption = scenario.strikePrice.mul(toBigNumber(100)).add(1)
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        const amountOfOptionsBuyerToMint = toBigNumber(4).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const amountOfStrikeBuyerToMintOption = scenario.strikePrice.mul(toBigNumber(4)).add(1)
        const numberOfOptionsToSell = toBigNumber(3).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        await addLiquidity(optionAMMPool, amountOfOptionsToMint, amountOfStrikeLpNeed, lp)

        // Creating options to sell
        await mintOptions(option, numberOfOptionsToSell, buyer)
        await option.connect(buyer).approve(optionAMMPool.address, numberOfOptionsToSell)

        const buyerOptionBeforeTrade = await option.balanceOf(buyerAddress)
        const tokenBBeforeTrade = await mockStrikeAsset.balanceOf(buyerAddress)

        const [poolOptionAmountBeforeTrade] = await optionAMMPool.getPoolBalances()
        // const tradeDetails = await optionAMMPool.getOptionTradeDetailsExactAInput(numberOfOptionsToSell)

        const priceObj = await optionAMMPool.getOptionTradeDetailsExactAInput(numberOfOptionsToSell)

        await expect(optionAMMPool.connect(buyer).tradeExactAInput(numberOfOptionsToSell, '1000000000000000000000000', buyerAddress, priceObj.newIV)).to.be.revertedWith('AMM: slippage not acceptable')

        const trade = optionAMMPool.connect(buyer)
          .tradeExactAInput(numberOfOptionsToSell, 0, buyerAddress, priceObj.newIV)

        await expect(trade).to.emit(optionAMMPool, 'TradeInfo')
          .withArgs(scenario.emittedSpotPrice, priceObj.newIV)

        const buyerOptionAfterBuyer = await option.balanceOf(buyerAddress)
        const tokenBAfterTrade = await mockStrikeAsset.balanceOf(buyerAddress)
        const tokensSpent = tokenBAfterTrade.sub(tokenBBeforeTrade)
        // expect(tradeDetails.amountBOut).to.be.equal(tokensSpent)

        const [poolOptionAmountAfterTrade] = await optionAMMPool.getPoolBalances()

        expect(buyerOptionAfterBuyer).to.eq(buyerOptionBeforeTrade.sub(numberOfOptionsToSell))
        expect(poolOptionAmountAfterTrade).to.eq(poolOptionAmountBeforeTrade.add(numberOfOptionsToSell))
      })

      it('should revert if trying to sell a lot of options (targetPrice < minimum acceptable', async () => {
        if (scenario.optionType === OPTION_TYPE_PUT) {
          await defaultPriceFeed.setRoundData({
            roundId: 1,
            answer: toBigNumber(16000e8),
            startedAt: await getTimestamp(),
            updatedAt: await getTimestamp() + 1,
            answeredInRound: 1
          })
        }
        const amountOfStrikeLpNeed = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        const numberOfOptionsToSell = toBigNumber(3).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        await addLiquidity(optionAMMPool, amountOfOptionsToMint, amountOfStrikeLpNeed, lp)

        // Creating options to sell
        await mintOptions(option, numberOfOptionsToSell, buyer)
        await option.connect(buyer).approve(optionAMMPool.address, numberOfOptionsToSell)

        await expect(optionAMMPool.connect(buyer).tradeExactAInput(numberOfOptionsToSell, '1000000000000000000000000', buyerAddress, scenario.initialSigma)).to.be.revertedWith('AMM: invalid amountBOut')
      })

      it('should revert if any dependency contract is stopped', async () => {
        const optionLiquidityToAdd = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const stableLiquidityToAdd = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        await addLiquidity(optionAMMPool, optionLiquidityToAdd, stableLiquidityToAdd, lp)

        const optionsToSell = toBigNumber(3).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const minStableToBuy = 0
        await mintOptions(option, optionsToSell, buyer)
        await option.connect(buyer).approve(optionAMMPool.address, optionsToSell)

        // Stopping just before trade
        const emergencyStop = await ethers.getContractAt(
          'EmergencyStop',
          await configurationManager.getEmergencyStop()
        )
        await emergencyStop.stop(await configurationManager.getPriceProvider())

        await expect(
          optionAMMPool.connect(buyer)
            .tradeExactAInput(optionsToSell, minStableToBuy, buyerAddress, scenario.initialSigma)
        ).to.be.revertedWith('Pool: Pool is stopped')
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

        await addLiquidity(optionAMMPool, amountOfOptionsToMint, amountOfStrikeLpNeed, lp)

        // Creating options to sell
        await mintOptions(option, numberOfOptionsToSell, buyer)
        await option.connect(buyer).approve(optionAMMPool.address, numberOfOptionsToSell)

        const buyerStrikeBeforeTrade = await mockStrikeAsset.balanceOf(buyerAddress)
        const buyerOptionBeforeTrade = await option.balanceOf(buyerAddress)

        const [poolOptionAmountBeforeTrade, poolStrikeAmountBeforeTrade] = await optionAMMPool.getPoolBalances()
        const tradeDetails = await optionAMMPool.getOptionTradeDetailsExactBOutput(numberOfTokensToReceive)

        await expect(optionAMMPool.connect(buyer).tradeExactBOutput(numberOfTokensToReceive, 1, buyerAddress, scenario.initialSigma)).to.be.revertedWith('AMM: slippage not acceptable')

        const trade = optionAMMPool.connect(buyer)
          .tradeExactBOutput(numberOfTokensToReceive, ethers.constants.MaxUint256, buyerAddress, scenario.initialSigma)

        await expect(trade).to.emit(optionAMMPool, 'TradeInfo')
          .withArgs(scenario.emittedSpotPrice, scenario.initialSigma)

        const buyerOptionAfterTrade = await option.balanceOf(buyerAddress)
        const buyerStrikeAfterTrade = await mockStrikeAsset.balanceOf(buyerAddress)
        const tokensSpent = buyerOptionBeforeTrade.sub(buyerOptionAfterTrade)
        expect(tradeDetails.amountAIn).to.be.equal(tokensSpent)

        const [poolOptionAmountAfterTrade, poolStrikeAmountAfterTrade] = await optionAMMPool.getPoolBalances()

        const feesBN = (new BigNumber(numberOfTokensToReceive.toString()).multipliedBy(new BigNumber(0.03))).toFixed(0, 2)
        const fees = toBigNumber(feesBN.toString())

        expect(poolStrikeAmountBeforeTrade).to.eq(poolStrikeAmountAfterTrade.add(numberOfTokensToReceive).add(fees))
        expect(buyerStrikeBeforeTrade).to.eq(buyerStrikeAfterTrade.sub(numberOfTokensToReceive))

        // Testing Remove Liquidity
        await optionAMMPool.connect(lp).removeLiquidity(100, 100)
      })

      it('should revert if trying to sell a lot of options (targetPrice < minimum acceptable)', async () => {
        if (scenario.optionType === OPTION_TYPE_PUT) {
          await defaultPriceFeed.setRoundData({
            roundId: 1,
            answer: toBigNumber(16000e8),
            startedAt: await getTimestamp(),
            updatedAt: await getTimestamp() + 1,
            answeredInRound: 1
          })
        }
        const amountOfStrikeLpNeed = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        const numberOfTokensToReceive = toBigNumber(4000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const numberOfOptionsToMint = toBigNumber(10).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        await addLiquidity(optionAMMPool, amountOfOptionsToMint, amountOfStrikeLpNeed, lp)

        // Creating options to sell
        await mintOptions(option, numberOfOptionsToMint, buyer)
        await option.connect(buyer).approve(optionAMMPool.address, numberOfOptionsToMint)

        await expect(optionAMMPool.connect(buyer).tradeExactBOutput(numberOfTokensToReceive, '1000000000000000000000000', buyerAddress, scenario.initialSigma)).to.be.revertedWith('AMM: invalid amountAIn')
      })

      it('should revert if any dependency contract is stopped', async () => {
        const optionLiquidityToAdd = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const stableLiquidityToAdd = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        await addLiquidity(optionAMMPool, optionLiquidityToAdd, stableLiquidityToAdd, lp)

        const stableToBuy = toBigNumber(1).mul(toBigNumber(10).pow(toBigNumber(scenario.strikeAssetDecimals)))
        const maxOptionsToSell = ethers.constants.MaxUint256
        const amountOfBuyerOptions = toBigNumber(3).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        await mintOptions(option, amountOfBuyerOptions, buyer)
        await option.connect(buyer).approve(optionAMMPool.address, amountOfBuyerOptions)

        // Stopping just before trade
        const emergencyStop = await ethers.getContractAt(
          'EmergencyStop',
          await configurationManager.getEmergencyStop()
        )
        await emergencyStop.stop(await configurationManager.getPriceProvider())

        await expect(
          optionAMMPool.connect(buyer)
            .tradeExactBOutput(stableToBuy, maxOptionsToSell, buyerAddress, scenario.initialSigma)
        ).to.be.revertedWith('Pool: Pool is stopped')
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

        await addLiquidity(optionAMMPool, amountOfOptionsToMint, amountOfStrikeLpNeed, lp)

        const actions = [
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
        const buyerOptionBeforeTrade = await option.balanceOf(buyerAddress)

        const [poolOptionAmountBeforeTrade, poolStrikeAmountBeforeTrade] = await optionAMMPool.getPoolBalances()
        const tradeDetails = await optionAMMPool.getOptionTradeDetailsExactBInput(numberOfTokensToSend)

        await expect(optionAMMPool.connect(buyer).tradeExactBInput(numberOfTokensToSend, ethers.constants.MaxUint256, buyerAddress, scenario.initialSigma)).to.be.revertedWith('AMM: slippage not acceptable')

        const trade = optionAMMPool.connect(buyer).tradeExactBInput(numberOfTokensToSend, 0, buyerAddress, scenario.initialSigma)

        await expect(trade).to.emit(optionAMMPool, 'TradeInfo')
          .withArgs(scenario.emittedSpotPrice, scenario.initialSigma)

        const buyerOptionAfterBuyer = await option.balanceOf(buyerAddress)
        const buyerStrikeAfterBuyer = await mockStrikeAsset.balanceOf(buyerAddress)
        const tokensReceived = buyerOptionAfterBuyer.sub(buyerOptionBeforeTrade)
        expect(tradeDetails.amountAOut).to.be.equal(tokensReceived)

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
        ).to.be.revertedWith('Pool: Pool is stopped')
      })
    })
    describe('Flashloan protection', () => {
      it('Should revert if an origin address tries to perform -add liquidity- and -trade- in the same block', async () => {
        const AttackerContract = await ethers.getContractFactory('AttackerOptionPool')
        const attackerContract = await AttackerContract.deploy()

        const stableLiquidityToAdd = toBigNumber(60000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const optionLiquidityToAdd = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const optionLiquidityToBuy = optionLiquidityToAdd.div(100)

        await mintOptions(option, optionLiquidityToAdd, buyer)
        await option.connect(buyer).approve(attackerContract.address, ethers.constants.MaxUint256)
        await addLiquidity(optionAMMPool, optionLiquidityToAdd, stableLiquidityToAdd, lp)

        await mockStrikeAsset.connect(buyer).mint(stableLiquidityToAdd.mul(200))
        await mockStrikeAsset.connect(buyer).approve(attackerContract.address, ethers.constants.MaxUint256)
        const tradeDetails = await optionAMMPool.getOptionTradeDetailsExactAOutput(optionLiquidityToBuy)

        await expect(attackerContract.connect(buyer).addLiquidityAndBuy(optionAMMPool.address, optionLiquidityToAdd, stableLiquidityToAdd, optionLiquidityToBuy, tradeDetails.newIV, buyerAddress)).to.be.revertedWith('FlashloanProtection: reentrant call')
      })
      it('Should revert if an origin address tries to perform -add liquidity- and -remove liquidity- in the same block', async () => {
        const AttackerContract = await ethers.getContractFactory('AttackerOptionPool')
        const attackerContract = await AttackerContract.deploy()

        const stableLiquidityToAdd = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const optionLiquidityToAdd = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        await mintOptions(option, optionLiquidityToAdd, buyer)
        await option.connect(buyer).approve(attackerContract.address, ethers.constants.MaxUint256)

        await mockStrikeAsset.connect(buyer).mint(stableLiquidityToAdd.mul(200))
        await mockStrikeAsset.connect(buyer).approve(attackerContract.address, ethers.constants.MaxUint256)

        await expect(attackerContract.connect(buyer).addLiquidityAndRemove(optionAMMPool.address, stableLiquidityToAdd, optionLiquidityToAdd, buyerAddress)).to.be.revertedWith('FlashloanProtection: reentrant call')
      })
    })
  })
})
