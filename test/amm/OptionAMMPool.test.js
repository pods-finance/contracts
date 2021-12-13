const { ethers, waffle: { deployMockContract } } = require('hardhat')
const { expect } = require('chai')
const BigNumber = require('bignumber.js')
const skipToWithdrawWindow = require('../util/skipToWithdrawWindow')
const IAaveIncentivesController = require('../../abi/IAaveIncentivesController.json')
const createPriceFeedMock = require('../util/createPriceFeedMock')
const createMockOption = require('../util/createMockOption')
const createNewPool = require('../util/createNewPool')
const createOptionFactory = require('../util/createOptionFactory')
const { toBigNumber, approximately } = require('../../utils/utils')
const createConfigurationManager = require('../util/createConfigurationManager')
const mintOptions = require('../util/mintOptions')
const addLiquidity = require('../util/addLiquidity')
const getTimestamp = require('../util/getTimestamp')
const createOptionAMMPool = require('../util/createOptionAMMPool')

const OPTION_TYPE_PUT = 0
const OPTION_TYPE_CALL = 1
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
    initialSpotPrice: toBigNumber(18000e8),
    emittedSpotPrice: toBigNumber(18000e18),
    spotPriceDecimals: 8,
    initialIV: toBigNumber(1.661e18),
    initialOracleIV: toBigNumber(1.661e18),
    decimalsOracleIV: 18,
    expectedNewIV: toBigNumber(1.66615e18),
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
    initialSpotPrice: toBigNumber(18000e8),
    emittedSpotPrice: toBigNumber(18000e18),
    spotPriceDecimals: 8,
    initialIV: toBigNumber(2 * 1e18),
    initialOracleIV: toBigNumber(200 * 1e18),
    decimalsOracleIV: 20,
    expectedNewIV: toBigNumber(1.2 * 1e18),
    cap: ethers.BigNumber.from(2000000e6.toString())
  }
]

scenarios.forEach(scenario => {
  describe('OptionAMMPool.sol - ' + scenario.name, () => {
    let MockERC20, WETH, OptionAMMFactory, FeePoolBuilder, OptionAMMPool, PriceProvider, IVProvider, rewardToken
    let weth
    let configurationManager
    let mockUnderlyingAsset
    let mockStrikeAsset
    let factoryContract
    let optionAMMFactory
    let feePoolBuilder
    let priceProvider
    let ivProvider
    let option
    let optionAMMPool
    let deployer, second, buyer, delegator, lp
    let deployerAddress, secondAddress, buyerAddress, delegatorAddress, lpAddress, MintableInterestBearing, aaveRewardDistributor, claimable
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

      ;[MockERC20, WETH, OptionAMMFactory, FeePoolBuilder, OptionAMMPool, PriceProvider, IVProvider, MintableInterestBearing, aaveRewardDistributor] = await Promise.all([
        ethers.getContractFactory('MintableERC20'),
        ethers.getContractFactory('WETH'),
        ethers.getContractFactory('OptionAMMFactory'),
        ethers.getContractFactory('FeePoolBuilder'),
        ethers.getContractFactory('OptionAMMPool'),
        ethers.getContractFactory('PriceProvider'),
        ethers.getContractFactory('IVProvider'),
        ethers.getContractFactory('MintableInterestBearing'),
        await deployMockContract(deployer, IAaveIncentivesController)
      ])

      rewardToken = await MintableInterestBearing.deploy('Reward Token', 'RWD', 18)

      ;[weth, mockUnderlyingAsset, mockStrikeAsset] = await Promise.all([
        WETH.deploy(),
        MockERC20.deploy(scenario.underlyingAssetSymbol, scenario.underlyingAssetSymbol, scenario.underlyingAssetDecimals),
        MockERC20.deploy(scenario.strikeAssetSymbol, scenario.strikeAssetSymbol, scenario.strikeAssetDecimals)
      ])
      defaultPriceFeed = await createPriceFeedMock(deployer)

      feePoolBuilder = await FeePoolBuilder.deploy()
    })

    beforeEach(async function () {
      configurationManager = await createConfigurationManager()

      await configurationManager.setParameter(
        ethers.utils.formatBytes32String('REWARD_ASSET'),
        rewardToken.address
      )
      await configurationManager.setParameter(
        ethers.utils.formatBytes32String('REWARD_CONTRACT'),
        aaveRewardDistributor.address
      )

      await defaultPriceFeed.setDecimals(scenario.spotPriceDecimals)
      await defaultPriceFeed.setRoundData({
        roundId: 1,
        answer: scenario.initialSpotPrice,
        startedAt: await getTimestamp(),
        updatedAt: await getTimestamp() + 1,
        answeredInRound: 1
      })
      priceProvider = await PriceProvider.deploy(configurationManager.address, [mockUnderlyingAsset.address], [defaultPriceFeed.contract.address])

      ivProvider = await IVProvider.deploy()

      await configurationManager.setPriceProvider(priceProvider.address)
      await configurationManager.setIVProvider(ivProvider.address)

      factoryContract = await createOptionFactory(configurationManager)

      option = await createMockOption({
        underlyingAsset: mockUnderlyingAsset.address,
        strikeAsset: mockStrikeAsset.address,
        strikePrice: scenario.strikePrice,
        configurationManager,
        optionType: scenario.optionType
      })

      await ivProvider.setUpdater(deployerAddress)
      await ivProvider.updateIV(option.address, scenario.initialOracleIV, scenario.decimalsOracleIV)

      optionAMMFactory = await OptionAMMFactory.deploy(configurationManager.address, feePoolBuilder.address)
      optionAMMPool = await createOptionAMMPool(option, {
        configurationManager,
        initialSigma: scenario.initialIV,
        tokenB: mockStrikeAsset.address
      })

      claimable = ethers.BigNumber.from(20e18.toString())
      await aaveRewardDistributor.mock.getRewardsBalance.returns(claimable)
      await aaveRewardDistributor.mock.claimRewards.returns(claimable)

      await rewardToken.connect(deployer).mint(claimable)
      await rewardToken.connect(deployer).transfer(optionAMMPool.address, claimable)
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
          optionAMMPool.connect(buyer).tradeExactBOutput(0, ethers.constants.MaxUint256, buyerAddress, scenario.initialIV)
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

        const tx = createOptionAMMPool.getTransaction(option, {
          configurationManager,
          initialSigma: scenario.initialIV,
          tokenB: mockTokenB.address
        })

        await expect(tx).to.be.revertedWith('Pool: invalid strikePrice unit')
      })

      it('should revert when trying to deploy a Pool with tokenB decimals > PRICING_DECIMALS', async () => {
        option = await createMockOption({
          underlyingAsset: mockUnderlyingAsset.address,
          strikeAsset: mockStrikeAsset.address,
          strikePrice: scenario.strikePrice,
          configurationManager
        })
        const mockTokenB = await MockERC20.deploy('TEST', 'TEST', '20')
        const tx = createOptionAMMPool.getTransaction(option, {
          configurationManager,
          initialSigma: scenario.initialIV,
          tokenB: mockTokenB.address
        })

        await expect(tx).to.be.revertedWith('Pool: invalid tokenB unit')
      })

      it('should not allow add liquidity after option expiration', async () => {
        await skipToWithdrawWindow(option)
        await expect(
          optionAMMPool.connect(buyer).addLiquidity(0, 0, buyerAddress)
        ).to.be.revertedWith('Pool: exercise window has started')
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

        const tx = createNewPool(deployerAddress, optionAMMFactory, americanOption.address, mockStrikeAsset.address, scenario.initialIV)
        await expect(tx).to.be.revertedWith('Pool: invalid exercise type')
      })
    })

    describe('Reading functions', () => {
      it('should return the ABPrice', async () => {
        await expect(optionAMMPool.getABPrice()).to.not.be.reverted
      })
      it('should return the AdjustedIV', async () => {
        expect(await optionAMMPool.getAdjustedIV()).to.be.eq(scenario.initialIV)
      })
      it('should return the remove liquidity amount including fees', async () => {
        const amountOfStrikeLpNeed = toBigNumber(60000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const numberOfOptionsToBuy = toBigNumber(1).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        await mockStrikeAsset.connect(buyer).mint(amountOfStrikeLpNeed)
        await mockStrikeAsset.connect(buyer).approve(optionAMMPool.address, ethers.constants.MaxUint256)

        await addLiquidity(optionAMMPool, amountOfOptionsToMint, amountOfStrikeLpNeed, lp)

        const tradeDetails = await optionAMMPool.getOptionTradeDetailsExactAOutput(numberOfOptionsToBuy)
        await optionAMMPool.connect(buyer)
          .tradeExactAOutput(numberOfOptionsToBuy, ethers.constants.MaxUint256, buyerAddress, tradeDetails.newIV)

        const strikeTokenBefore = await mockStrikeAsset.balanceOf(lp.address)
        const optionTokenBefore = await option.balanceOf(lp.address)

        const removeLiquidityAmounts = await optionAMMPool.getRemoveLiquidityAmounts(100, 100, lp.address)

        const optionTokenRead = removeLiquidityAmounts.withdrawAmountA
        const strikeTokenRead = removeLiquidityAmounts.withdrawAmountB

        await optionAMMPool.connect(lp).removeLiquidity(100, 100)

        const optionTokenAfter = await option.balanceOf(lp.address)
        const strikeTokenAfter = await mockStrikeAsset.balanceOf(lp.address)

        const optionTokenEarned = optionTokenAfter.sub(optionTokenBefore)
        const strikeTokenEarned = strikeTokenAfter.sub(strikeTokenBefore)

        expect(optionTokenRead).to.be.eq(optionTokenEarned)
        expect(strikeTokenRead).to.be.eq(strikeTokenEarned)
      })
    })

    describe('Add Liquidity', () => {
      it('should revert if not the owner tries to add liquidity on behalf of others', async () => {
        await expect(optionAMMPool.addLiquidity(0, 0, buyerAddress)).to.be.revertedWith('AMM: invalid sender')
      })

      it('should revert if user dont supply liquidity of both assets', async () => {
        await expect(optionAMMPool.addLiquidity(0, 0, deployerAddress)).to.be.revertedWith('AMM: invalid first liquidity')
      })

      it('should revert if user ask more assets to it has in balance', async () => {
        await expect(
          optionAMMPool.addLiquidity(1000, 10000, deployerAddress)
        ).to.be.reverted
      })

      it('should not be able to add more liquidity than the cap', async () => {
        const capProvider = await ethers.getContractAt('CapProvider', configurationManager.getCapProvider())
        capProvider.setCap(optionAMMPool.address, scenario.cap)

        const capSize = await optionAMMPool.capSize()
        const capExceeded = capSize.add(1)

        await mockStrikeAsset.mint(capExceeded)
        await expect(optionAMMPool.addLiquidity(0, capExceeded, deployerAddress))
          .to.be.revertedWith('CappedPool: amount exceed cap')
      })

      it('should revert if the pool is stopped', async () => {
        const emergencyStop = await ethers.getContractAt(
          'EmergencyStop',
          await configurationManager.getEmergencyStop()
        )

        await emergencyStop.stop(optionAMMPool.address)

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

        optionAMMPool = await createOptionAMMPool(podPut, {
          configurationManager,
          initialSigma: toBigNumber(0.261e18),
          tokenB: mockStrikeAsset.address
        })

        const amountOfStrikeLpNeed = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfStrikeLpToMintOption = scenario.strikePrice.mul(toBigNumber(100)).add(1)
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

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

        await expect(optionAMMPool.addLiquidity(1000, 10000, deployerAddress)).to.be.revertedWith('AMM: option price zero')
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
          .withArgs(scenario.emittedSpotPrice, scenario.initialIV)
      })
    })

    describe('Remove Liquidity', () => {
      it('should remove all amount after simple addition', async () => {
        const amountOfStrikeLpNeed = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        await addLiquidity(optionAMMPool, amountOfOptionsToMint, amountOfStrikeLpNeed, lp)

        const feeAddressA = await optionAMMPool.feePoolA()
        const feeAddressB = await optionAMMPool.feePoolB()

        const lpOptionBeforeTrade = await option.balanceOf(lpAddress)
        const lpStrikeBeforeTrade = await mockStrikeAsset.balanceOf(lpAddress)

        const withdrawObj = await optionAMMPool.connect(lp).getRemoveLiquidityAmounts(100, 100, lpAddress)

        const removal = optionAMMPool.connect(lp).removeLiquidity(100, 100)

        await expect(removal).to.emit(optionAMMPool, 'TradeInfo')
          .withArgs(scenario.emittedSpotPrice, scenario.initialIV)

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

      it('should revert if the pool is stopped', async () => {
        const emergencyStop = await ethers.getContractAt(
          'EmergencyStop',
          await configurationManager.getEmergencyStop()
        )

        await mintOptions(option, scenario.amountToMint, deployer)

        await mockStrikeAsset.mint(scenario.amountOfStableToAddLiquidity)
        await mockStrikeAsset.approve(optionAMMPool.address, scenario.amountOfStableToAddLiquidity)
        await option.approve(optionAMMPool.address, scenario.amountToMint)

        await optionAMMPool.addLiquidity(scenario.amountToMint, scenario.amountOfStableToAddLiquidity, deployerAddress)

        await emergencyStop.stop(optionAMMPool.address)

        await expect(
          optionAMMPool.removeLiquidity(scenario.amountToMint, scenario.amountOfStableToAddLiquidity)
        ).to.be.revertedWith('Pool: Pool is stopped')
      })

      it('should remove liquidity when option price is rounded to zero', async () => {
        const amountOfStrikeLpNeed = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        await addLiquidity(optionAMMPool, amountOfOptionsToMint, amountOfStrikeLpNeed, lp)

        const feeAddressA = await optionAMMPool.feePoolA()
        const feeAddressB = await optionAMMPool.feePoolB()

        // fast forward until very close to the maturity
        const expiration = await option.expiration()

        const nearExpiration = expiration - 60 * 60 * 2 // 2 hours before expiration
        await ethers.provider.send('evm_mine', [nearExpiration])
        await defaultPriceFeed.setUpdateAt(await getTimestamp())

        await optionAMMPool.connect(lp).removeLiquidity(100, 100)

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
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        await addLiquidity(optionAMMPool, amountOfOptionsToMint, amountOfStrikeLpNeed, lp)

        const feeAddressA = await optionAMMPool.feePoolA()
        const feeAddressB = await optionAMMPool.feePoolB()

        await skipToWithdrawWindow(option)

        await defaultPriceFeed.setUpdateAt(await getTimestamp())

        await optionAMMPool.connect(lp).removeLiquidity(100, 100)

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
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        await addLiquidity(optionAMMPool, amountOfOptionsToMint, amountOfStrikeLpNeed, lp)

        const feeAddressA = await optionAMMPool.feePoolA()
        const feeAddressB = await optionAMMPool.feePoolB()

        await optionAMMPool.connect(lp).removeLiquidity(100, 0)

        await optionAMMPool.connect(lp).removeLiquidity(0, 100)

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

      it('should remove partial liquidity and distribute fees partially accordingly', async () => {
        const amountOfStrikeLpNeed = toBigNumber(60000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const numberOfOptionsToBuy = toBigNumber(1).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const initialPercent = toBigNumber(100)

        const feeAddressA = await optionAMMPool.feePoolA()
        const feeAddressB = await optionAMMPool.feePoolB()

        await mockStrikeAsset.connect(buyer).mint(amountOfStrikeLpNeed)
        await mockStrikeAsset.connect(buyer).approve(optionAMMPool.address, ethers.constants.MaxUint256)

        // SITUATION A => Remove liquidity 100%
        await addLiquidity(optionAMMPool, amountOfOptionsToMint, amountOfStrikeLpNeed, lp)

        const tradeDetails = await optionAMMPool.getOptionTradeDetailsExactAOutput(numberOfOptionsToBuy)
        await optionAMMPool.connect(buyer)
          .tradeExactAOutput(numberOfOptionsToBuy, ethers.constants.MaxUint256, buyerAddress, tradeDetails.newIV)

        const FeePoolABefore1 = await mockStrikeAsset.balanceOf(feeAddressA)
        const FeePoolBBefore1 = await mockStrikeAsset.balanceOf(feeAddressB)

        await optionAMMPool.connect(lp).removeLiquidity(initialPercent, initialPercent)

        const feePoolAAfter1 = await mockStrikeAsset.balanceOf(feeAddressA)
        const feePoolBAfter1 = await mockStrikeAsset.balanceOf(feeAddressB)
        const feesEarnedA1 = FeePoolABefore1.sub(feePoolAAfter1)
        const feesEarnedB1 = FeePoolBBefore1.sub(feePoolBAfter1)
        const totalFeesEarned1 = feesEarnedA1.add(feesEarnedB1)

        // SITUATION A => Remove liquidity 100%
        await addLiquidity(optionAMMPool, amountOfOptionsToMint, amountOfStrikeLpNeed, lp)

        const tradeDetails2 = await optionAMMPool.getOptionTradeDetailsExactAOutput(numberOfOptionsToBuy)
        await optionAMMPool.connect(buyer)
          .tradeExactAOutput(numberOfOptionsToBuy, ethers.constants.MaxUint256, buyerAddress, tradeDetails2.newIV)

        const FeePoolABefore2 = await mockStrikeAsset.balanceOf(feeAddressA)
        const FeePoolBBefore2 = await mockStrikeAsset.balanceOf(feeAddressB)

        await optionAMMPool.connect(lp).removeLiquidity(initialPercent.div(2), initialPercent.div(2))

        const feePoolAAfter2 = await mockStrikeAsset.balanceOf(feeAddressA)
        const feePoolBAfter2 = await mockStrikeAsset.balanceOf(feeAddressB)

        const feesEarnedA2 = FeePoolABefore2.sub(feePoolAAfter2)
        const feesEarnedB2 = FeePoolBBefore2.sub(feePoolBAfter2)
        const totalFeesEarned2 = feesEarnedA2.add(feesEarnedB2)

        expect(approximately(totalFeesEarned1.div(2), totalFeesEarned2)).to.equal(true)
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

        optionAMMPool = await createOptionAMMPool(podPut, {
          configurationManager,
          initialSigma: toBigNumber(0.161e18),
          tokenB: mockStrikeAsset.address
        })
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

        await expect(optionAMMPool.connect(buyer).tradeExactAOutput(numberOfOptionsToBuy, ethers.constants.MaxUint256, buyerAddress, scenario.initialIV)).to.be.revertedWith('AMM: invalid amountBIn')

        await expect(optionAMMPool.connect(buyer).tradeExactAInput(numberOfOptionsToBuy, ethers.constants.MaxUint256, buyerAddress, scenario.initialIV)).to.be.revertedWith('AMM: invalid amountBOut')

        await expect(optionAMMPool.connect(buyer).tradeExactBOutput(numberOfOptionsToBuy, ethers.constants.MaxUint256, buyerAddress, scenario.initialIV)).to.be.revertedWith('AMM: invalid amountAIn')

        await expect(optionAMMPool.connect(buyer).tradeExactBInput(numberOfOptionsToBuy, ethers.constants.MaxUint256, buyerAddress, scenario.initialIV)).to.be.revertedWith('AMM: invalid amountAOut')
      })
    })
    describe('Withdraw Rewards', async () => {
      it('should revert if not the owner tries to call the function', async () => {
        await expect(optionAMMPool.connect(buyer).withdrawRewards()).to.be.revertedWith('not owner')
      })
      it('should collect rewards accordingly', async () => {
        await optionAMMPool.withdrawRewards()
        expect(await rewardToken.balanceOf(deployerAddress)).to.be.equal(claimable)
      })
    })

    describe('tradeExactAInput', () => {
      it('should match values accordingly', async () => {
        const amountOfStrikeLpNeed = toBigNumber(60000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

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

        await expect(optionAMMPool.connect(buyer).tradeExactAInput(numberOfOptionsToSell, '1000000000000000000000000', buyerAddress, scenario.initialIV)).to.be.revertedWith('AMM: invalid amountBOut')
      })

      it('should revert if the pool is stopped', async () => {
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
        await emergencyStop.stop(optionAMMPool.address)

        await expect(
          optionAMMPool.connect(buyer)
            .tradeExactAInput(optionsToSell, minStableToBuy, buyerAddress, scenario.initialIV)
        ).to.be.revertedWith('Pool: Pool is stopped')
      })
    })

    describe('tradeExactAOutput', () => {
      it('should match values accordingly', async () => {
        const feeAddressA = await optionAMMPool.feePoolA()
        const feeAddressB = await optionAMMPool.feePoolB()

        const amountOfStrikeLpNeed = toBigNumber(600000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const initialBuyerBalanceStrikeAsset = toBigNumber(10000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const numberOfOptionsToBuy = toBigNumber(1).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        await addLiquidity(optionAMMPool, amountOfOptionsToMint, amountOfStrikeLpNeed, lp)

        // Minting tokenB to sell
        await mockStrikeAsset.connect(buyer).mint(initialBuyerBalanceStrikeAsset)
        await mockStrikeAsset.connect(buyer).approve(optionAMMPool.address, initialBuyerBalanceStrikeAsset)

        const buyerStrikeAmountBeforeTrade = await mockStrikeAsset.balanceOf(buyerAddress)
        const poolStrikeAmountBeforeTrade = await mockStrikeAsset.balanceOf(optionAMMPool.address)

        const tradeDetails = await optionAMMPool.getOptionTradeDetailsExactAOutput(numberOfOptionsToBuy)

        await expect(optionAMMPool.connect(buyer).tradeExactAOutput(numberOfOptionsToBuy, 1, buyerAddress, scenario.initialIV)).to.be.revertedWith('AMM: slippage not acceptable')

        const trade = optionAMMPool.connect(buyer)
          .tradeExactAOutput(numberOfOptionsToBuy, ethers.constants.MaxUint256, buyerAddress, scenario.initialIV)

        await expect(trade).to.emit(optionAMMPool, 'TradeInfo')
          .withArgs(scenario.emittedSpotPrice, scenario.initialIV)

        const buyerStrikeAmountAfterTrade = await mockStrikeAsset.balanceOf(buyerAddress)
        const poolStrikeAmountAfterTrade = await mockStrikeAsset.balanceOf(optionAMMPool.address)

        const deltaPool = poolStrikeAmountAfterTrade.sub(poolStrikeAmountBeforeTrade)

        const tokensSpent = buyerStrikeAmountBeforeTrade.sub(buyerStrikeAmountAfterTrade)
        expect(tradeDetails.amountBIn).to.be.equal(tokensSpent)

        const feeContractA = await ethers.getContractAt('FeePool', feeAddressA)
        const feeContractB = await ethers.getContractAt('FeePool', feeAddressB)

        const feesAPortion = await feeContractA.feeValue()
        const feesBPortion = await feeContractB.feeValue()

        const balanceAfterOptionBuyer = await option.balanceOf(buyerAddress)

        const balanceAfterStrikeFeePoolA = await mockStrikeAsset.balanceOf(feeAddressA)
        const balanceAfterStrikeFeePoolB = await mockStrikeAsset.balanceOf(feeAddressB)

        expect(balanceAfterOptionBuyer).to.eq(numberOfOptionsToBuy)
        expect(balanceAfterStrikeFeePoolB).to.eq(balanceAfterStrikeFeePoolA.mul(feesBPortion).div(feesAPortion))
        expect(balanceAfterStrikeFeePoolA.add(balanceAfterStrikeFeePoolB.add(deltaPool))).to.be.eq(tokensSpent)
      })

      it('should revert if the pool is stopped', async () => {
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
        await emergencyStop.stop(optionAMMPool.address)

        await expect(
          optionAMMPool.connect(buyer)
            .tradeExactAOutput(optionsToBuy, minStableToSell, buyerAddress, scenario.initialIV)
        ).to.be.revertedWith('Pool: Pool is stopped')
      })
    })

    describe('tradeExactBInput', () => {
      it('should match values accordingly', async () => {
        const amountOfStrikeLpNeed = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

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

        const tradeDetails = await optionAMMPool.getOptionTradeDetailsExactBInput(numberOfTokensToSend)

        await expect(optionAMMPool.connect(buyer).tradeExactBInput(numberOfTokensToSend, ethers.constants.MaxUint256, buyerAddress, scenario.initialIV)).to.be.revertedWith('AMM: slippage not acceptable')

        const trade = optionAMMPool.connect(buyer).tradeExactBInput(numberOfTokensToSend, 0, buyerAddress, scenario.initialIV)

        await expect(trade).to.emit(optionAMMPool, 'TradeInfo')
          .withArgs(scenario.emittedSpotPrice, scenario.initialIV)

        const buyerOptionAfterBuyer = await option.balanceOf(buyerAddress)
        const buyerStrikeAfterBuyer = await mockStrikeAsset.balanceOf(buyerAddress)
        const tokensReceived = buyerOptionAfterBuyer.sub(buyerOptionBeforeTrade)
        expect(tradeDetails.amountAOut).to.be.equal(tokensReceived)

        expect(buyerStrikeAfterBuyer).to.eq(buyerStrikeBeforeTrade.sub(numberOfTokensToSend))
      })

      it('should revert if the pool is stopped', async () => {
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
        await emergencyStop.stop(optionAMMPool.address)

        await expect(
          optionAMMPool.connect(buyer)
            .tradeExactBInput(stableToSell, minOptionsToBuy, buyerAddress, scenario.initialIV)
        ).to.be.revertedWith('Pool: Pool is stopped')
      })
    })

    describe('tradeExactBOutput', () => {
      it('should match values accordingly', async () => {
        const amountOfStrikeLpNeed = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        const numberOfOptionsToSell = toBigNumber(3).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))

        const numberOfTokensToReceive = toBigNumber(1).mul(toBigNumber(10).pow(toBigNumber(scenario.strikeAssetDecimals)))

        await addLiquidity(optionAMMPool, amountOfOptionsToMint, amountOfStrikeLpNeed, lp)

        // Creating options to sell
        await mintOptions(option, numberOfOptionsToSell, buyer)
        await option.connect(buyer).approve(optionAMMPool.address, numberOfOptionsToSell)

        const buyerStrikeBeforeTrade = await mockStrikeAsset.balanceOf(buyerAddress)
        const buyerOptionBeforeTrade = await option.balanceOf(buyerAddress)

        const [, poolStrikeAmountBeforeTrade] = await optionAMMPool.getPoolBalances()
        const tradeDetails = await optionAMMPool.getOptionTradeDetailsExactBOutput(numberOfTokensToReceive)

        await expect(optionAMMPool.connect(buyer).tradeExactBOutput(numberOfTokensToReceive, 1, buyerAddress, scenario.initialIV)).to.be.revertedWith('AMM: slippage not acceptable')

        const trade = optionAMMPool.connect(buyer)
          .tradeExactBOutput(numberOfTokensToReceive, ethers.constants.MaxUint256, buyerAddress, scenario.initialIV)

        await expect(trade).to.emit(optionAMMPool, 'TradeInfo')
          .withArgs(scenario.emittedSpotPrice, scenario.initialIV)

        const buyerOptionAfterTrade = await option.balanceOf(buyerAddress)
        const buyerStrikeAfterTrade = await mockStrikeAsset.balanceOf(buyerAddress)
        const tokensSpent = buyerOptionBeforeTrade.sub(buyerOptionAfterTrade)
        expect(tradeDetails.amountAIn).to.be.equal(tokensSpent)

        const [, poolStrikeAmountAfterTrade] = await optionAMMPool.getPoolBalances()

        const feesBN = (new BigNumber(numberOfTokensToReceive.toString()).multipliedBy(new BigNumber(0.03))).toFixed(0, 2)
        const fees = toBigNumber(feesBN.toString())

        expect(poolStrikeAmountBeforeTrade).to.be.lt(poolStrikeAmountAfterTrade.add(numberOfTokensToReceive).add(fees))
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

        await expect(optionAMMPool.connect(buyer).tradeExactBOutput(numberOfTokensToReceive, '1000000000000000000000000', buyerAddress, scenario.initialIV)).to.be.revertedWith('AMM: insufficient liquidity')
      })

      it('should revert if the pool is stopped', async () => {
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
        await emergencyStop.stop(optionAMMPool.address)

        await expect(
          optionAMMPool.connect(buyer)
            .tradeExactBOutput(stableToBuy, maxOptionsToSell, buyerAddress, scenario.initialIV)
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

        await expect(attackerContract.connect(buyer).addLiquidityAndBuy(optionAMMPool.address, optionLiquidityToAdd, stableLiquidityToAdd, optionLiquidityToBuy, tradeDetails.newIV, buyerAddress)).to.be.revertedWith('CombinedActionsGuard: reentrant call')
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

        await expect(attackerContract.connect(buyer).addLiquidityAndRemove(optionAMMPool.address, stableLiquidityToAdd, optionLiquidityToAdd, buyerAddress)).to.be.revertedWith('CombinedActionsGuard: reentrant call')
      })
    })

    describe('OracleIV - Reduces IV impact between big trades', () => {
      it('Big buy - The Option price of the next trade should be cheaper if using oracleIV', async () => {
        const stableLiquidityToAdd = toBigNumber(60000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const optionLiquidityToAdd = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const optionLiquidityToBuy = optionLiquidityToAdd.div(20)

        await addLiquidity(optionAMMPool, optionLiquidityToAdd, stableLiquidityToAdd, lp)

        await mintOptions(option, optionLiquidityToBuy, buyer)
        await mockStrikeAsset.connect(buyer).mint(stableLiquidityToAdd.mul(2))

        await option.connect(buyer).approve(optionAMMPool.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(buyer).approve(optionAMMPool.address, ethers.constants.MaxUint256)

        const tradeDetails = await optionAMMPool.getOptionTradeDetailsExactAOutput(optionLiquidityToBuy)

        await optionAMMPool.connect(buyer)
          .tradeExactAOutput(optionLiquidityToBuy, ethers.constants.MaxUint256, buyerAddress, tradeDetails.newIV)

        const bsPriceWithOracleIV = await optionAMMPool.getABPrice()

        await ivProvider.updateIV(option.address, tradeDetails.newIV, '18')

        const bsPriceWithoutOracleIV = await optionAMMPool.getABPrice()

        expect(bsPriceWithoutOracleIV).to.be.gte(bsPriceWithOracleIV)
      })
      it('Big sell - The Option price of the next trade should be more expensive if using oracleIV', async () => {
        const stableLiquidityToAdd = toBigNumber(60000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const optionLiquidityToAdd = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const optionLiquidityToBuy = optionLiquidityToAdd.div(20)

        await addLiquidity(optionAMMPool, optionLiquidityToAdd, stableLiquidityToAdd, lp)

        await mintOptions(option, optionLiquidityToBuy, buyer)
        await mockStrikeAsset.connect(buyer).mint(stableLiquidityToAdd.mul(2))

        await option.connect(buyer).approve(optionAMMPool.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(buyer).approve(optionAMMPool.address, ethers.constants.MaxUint256)

        const tradeDetails = await optionAMMPool.getOptionTradeDetailsExactAInput(optionLiquidityToBuy)

        await optionAMMPool.connect(buyer)
          .tradeExactAInput(optionLiquidityToBuy, 0, buyerAddress, tradeDetails.newIV)

        const bsPriceWithOracleIV = await optionAMMPool.getABPrice()

        await ivProvider.updateIV(option.address, tradeDetails.newIV, '18')

        const bsPriceWithoutOracleIV = await optionAMMPool.getABPrice()

        expect(bsPriceWithOracleIV).to.be.gte(bsPriceWithoutOracleIV)
      })
      it('Should revert if caller is going to pay 0 fees due to a small trade', async () => {
        const stableLiquidityToAdd = toBigNumber(60000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const optionLiquidityToAdd = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const optionLiquidityToBuy = toBigNumber(1)

        await addLiquidity(optionAMMPool, optionLiquidityToAdd, stableLiquidityToAdd, lp)

        await mintOptions(option, optionLiquidityToBuy, buyer)
        await mockStrikeAsset.connect(buyer).mint(stableLiquidityToAdd.mul(2))

        await option.connect(buyer).approve(optionAMMPool.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(buyer).approve(optionAMMPool.address, ethers.constants.MaxUint256)

        const tradeDetails = await optionAMMPool.getOptionTradeDetailsExactAInput(optionLiquidityToBuy)

        await expect(optionAMMPool.connect(buyer)
          .tradeExactAInput(optionLiquidityToBuy, 0, buyerAddress, tradeDetails.newIV)).to.be.revertedWith('Pool: zero fees')
      })
    })

    describe('Withdraw Amount > TotalBalance case', () => {
      it('should remove all amount after simple addition', async () => {
        const tokenA = await MockERC20.deploy('tokenA', 'TKNA', '18')
        const tokenB = await MockERC20.deploy('tokenB', 'TKNB', '6')
        const expiration = await getTimestamp() + 724508

        await defaultPriceFeed.setDecimals('8')
        await defaultPriceFeed.setRoundData({
          roundId: 1,
          answer: '212873000000',
          startedAt: await getTimestamp(),
          updatedAt: await getTimestamp() + 1,
          answeredInRound: 1
        })

        option = await createMockOption({
          underlyingAsset: tokenA.address,
          strikeAsset: tokenB.address,
          strikePrice: '1400000000',
          configurationManager,
          optionType: '0',
          expiration: expiration
        })

        await priceProvider.setAssetFeeds([tokenA.address], [defaultPriceFeed.contract.address])

        await ivProvider.updateIV(option.address, '1550000000000000000', '18')

        optionAMMPool = await createOptionAMMPool(option, {
          configurationManager,
          initialSigma: '1550000000000000000',
          tokenB: tokenB.address
        })

        await hre.run('setParameter', { parameter: 'MIN_UPDATE_INTERVAL', value: '1000000', configuration: configurationManager.address, noUpdate: false })

        const actions01 = [
          {
            name: 'mint',
            contract: tokenB,
            user: deployer,
            params: ['1000000000000000000000000']
          },
          {
            name: 'approve',
            contract: tokenB,
            user: deployer,
            params: [option.address, ethers.constants.MaxUint256]
          },
          {
            name: 'mint',
            contract: option,
            user: deployer,
            params: ['2142857142800000000', deployerAddress]
          },
          {
            name: 'approve',
            contract: tokenB,
            user: deployer,
            params: [optionAMMPool.address, ethers.constants.MaxUint256]
          },
          {
            name: 'approve',
            contract: option,
            user: deployer,
            params: [optionAMMPool.address, ethers.constants.MaxUint256]
          },
          {
            name: 'addLiquidity',
            contract: optionAMMPool,
            user: deployer,
            params: ['2142857142800000000', '2000000000', deployerAddress]
          }

        ]

        const actions02 = [
          {
            name: 'mint',
            contract: tokenB,
            user: buyer,
            params: ['1000000000000000000000000000000000000']
          },
          {
            name: 'approve',
            contract: tokenB,
            user: buyer,
            params: [option.address, ethers.constants.MaxUint256]
          },
          {
            name: 'mint',
            contract: option,
            user: buyer,
            params: ['1428571428500000000', buyerAddress]
          },
          {
            name: 'approve',
            contract: tokenB,
            user: buyer,
            params: [optionAMMPool.address, ethers.constants.MaxUint256]
          },
          {
            name: 'approve',
            contract: option,
            user: buyer,
            params: [optionAMMPool.address, ethers.constants.MaxUint256]
          },
          {
            name: 'spotPrice',
            params: ['212873000000']
          },
          {
            name: 'timestamp',
            params: ['665736']
          },
          {
            name: 'addLiquidity',
            contract: optionAMMPool,
            user: buyer,
            params: ['1428571428500000000', '5857733', buyerAddress]
          }
        ]

        const actions03 = [
          {
            name: 'mint',
            contract: option,
            user: buyer,
            params: ['428571428500000000', buyerAddress]
          },
          {
            name: 'spotPrice',
            params: ['212736492086']
          },
          {
            name: 'timestamp',
            params: ['665400']
          },
          {
            name: 'addLiquidity',
            contract: optionAMMPool,
            user: buyer,
            params: ['428571428500000000', '2035606', buyerAddress]
          }
        ]

        const actions04 = [
          {
            name: 'mint',
            contract: option,
            user: buyer,
            params: ['21428571400000000', buyerAddress]
          },
          {
            name: 'spotPrice',
            params: ['211819551381']
          },
          {
            name: 'timestamp',
            params: ['665292']
          },
          {
            name: 'tradeExactAInput',
            contract: optionAMMPool,
            user: buyer,
            params: ['21428571400000000', '98691', buyerAddress, '1550000000000000000']
          }
        ]

        const actions05 = [
          {
            name: 'spotPrice',
            params: ['211819551381']
          },
          {
            name: 'timestamp',
            params: ['665055']
          },
          {
            name: 'tradeExactBInput',
            contract: optionAMMPool,
            user: buyer,
            params: ['3000000', '436514094380000000', buyerAddress, '1625901275547008968']
          }
        ]

        const actions06 = [
          {
            name: 'spotPrice',
            params: ['210365774025']
          },
          {
            name: 'timestamp',
            params: ['655827']
          },
          {
            name: 'removeLiquidity',
            contract: optionAMMPool,
            user: buyer,
            params: ['100', '100']
          }
        ]

        const actions07 = [
          {
            name: 'spotPrice',
            params: ['208835940853']
          },
          {
            name: 'timestamp',
            params: ['649363']
          },
          {
            name: 'addLiquidity',
            contract: optionAMMPool,
            user: buyer,
            params: ['1885468454400000000', '9605174', buyerAddress]
          }
        ]

        const actions08 = [
          {
            name: 'spotPrice',
            params: ['211875675870']
          },
          {
            name: 'timestamp',
            params: ['647285']
          },
          {
            name: 'addLiquidity',
            contract: optionAMMPool,
            user: buyer,
            params: ['236142283300000000', '1171256', buyerAddress]
          }
        ]

        const actions09 = [
          {
            name: 'mint',
            contract: tokenB,
            user: second,
            params: ['1000000000000000000000000000000000000']
          },
          {
            name: 'approve',
            contract: tokenB,
            user: second,
            params: [option.address, ethers.constants.MaxUint256]
          },
          {
            name: 'mint',
            contract: option,
            user: second,
            params: ['107142857100000000', secondAddress]
          },
          {
            name: 'approve',
            contract: option,
            user: second,
            params: [optionAMMPool.address, ethers.constants.MaxUint256]
          },
          {
            name: 'spotPrice',
            params: ['204691681459']
          },
          {
            name: 'timestamp',
            params: ['591138']
          },
          {
            name: 'tradeExactAInput',
            contract: optionAMMPool,
            user: second,
            params: ['107142857100000000', '546008', secondAddress, '1549220341740704093']
          }
        ]

        const actions10 = [
          {
            name: 'mint',
            contract: option,
            user: second,
            params: ['170714285700000000', secondAddress]
          },
          {
            name: 'spotPrice',
            params: ['203952000000']
          },
          {
            name: 'timestamp',
            params: ['590618']
          },
          {
            name: 'tradeExactAInput',
            contract: optionAMMPool,
            user: second,
            params: ['170714285700000000', '78556', secondAddress, '1549220341740704093']
          }
        ]

        const actions11 = [
          {
            name: 'mint',
            contract: option,
            user: second,
            params: ['7857142800000000', secondAddress]
          },
          {
            name: 'spotPrice',
            params: ['203952000000']
          },
          {
            name: 'timestamp',
            params: ['590570']
          },
          {
            name: 'tradeExactAInput',
            contract: optionAMMPool,
            user: second,
            params: ['7857142800000000', '37651', secondAddress, '1549220341740704093']
          }
        ]

        const actions12 = [
          {
            name: 'mint',
            contract: tokenB,
            user: delegator,
            params: ['1000000000000000000000000000000000000']
          },
          {
            name: 'approve',
            contract: tokenB,
            user: delegator,
            params: [option.address, ethers.constants.MaxUint256]
          },
          {
            name: 'mint',
            contract: option,
            user: delegator,
            params: ['714285714200000000', delegatorAddress]
          },
          {
            name: 'approve',
            contract: option,
            user: delegator,
            params: [optionAMMPool.address, ethers.constants.MaxUint256]
          },
          {
            name: 'spotPrice',
            params: ['219811764223']
          },
          {
            name: 'timestamp',
            params: ['516396']
          },
          {
            name: 'tradeExactAInput',
            contract: optionAMMPool,
            user: delegator,
            params: ['714285714200000000', '618092', delegatorAddress, '1474349727450624219']
          }
        ]

        const actions13 = [
          {
            name: 'mint',
            contract: tokenB,
            user: lp,
            params: ['1000000000000000000000000000000000000']
          },
          {
            name: 'approve',
            contract: tokenB,
            user: lp,
            params: [optionAMMPool.address, ethers.constants.MaxUint256]
          },
          {
            name: 'spotPrice',
            params: ['227436216110']
          },
          {
            name: 'timestamp',
            params: ['438900']
          },
          {
            name: 'tradeExactAOutput',
            contract: optionAMMPool,
            user: lp,
            params: ['2000000000000000000', '15184836', lpAddress, '1686535732032623738']
          }
        ]

        const actions14 = [
          {
            name: 'approve',
            contract: option,
            user: lp,
            params: [optionAMMPool.address, ethers.constants.MaxUint256]
          },
          {
            name: 'spotPrice',
            params: ['223635726850']
          },
          {
            name: 'timestamp',
            params: ['292613']
          },
          {
            name: 'tradeExactAInput',
            contract: optionAMMPool,
            user: lp,
            params: ['1000000000000000000', '24365', lpAddress, '1502530135024776995']
          }
        ]

        const actions15 = [
          {
            name: 'spotPrice',
            params: ['223635726850']
          },
          {
            name: 'timestamp',
            params: ['292521']
          },
          {
            name: 'tradeExactAInput',
            contract: optionAMMPool,
            user: lp,
            params: ['1000000000000000000', '18535', lpAddress, '1441565389680518417']
          }
        ]

        const actions16 = [
          {
            name: 'spotPrice',
            params: ['189533077154']
          },
          {
            name: 'timestamp',
            params: ['2521']
          },
          {
            name: 'removeLiquidity',
            contract: optionAMMPool,
            user: deployer,
            params: ['100', '100']
          }
        ]
        const combinedActions = actions01.concat(actions02, actions03, actions04, actions05, actions06, actions07, actions08, actions09, actions10, actions11, actions12, actions13, actions14, actions15, actions16)
        const fnActions = combinedActions.map(action => {
          let fn
          if (action.name === 'spotPrice') {
            fn = async () => changeSpotPrice(defaultPriceFeed, action.params[0])
          } else if (action.name === 'timestamp') {
            fn = async () => ethers.provider.send('evm_mine', [expiration - action.params[0]])
          } else {
            fn = async () => action.contract.connect(action.user)[action.name](...action.params)
          }
          return fn
        })

        for (const fn of fnActions) {
          await fn()
        }

        const poolTokenABalanceBefore = await option.balanceOf(optionAMMPool.address)
        const lastRemoveLiquidity = optionAMMPool.connect(buyer).removeLiquidity('100', '100')

        await expect(lastRemoveLiquidity).to.emit(optionAMMPool, 'RemoveLiquidity')
          .withArgs(buyerAddress, poolTokenABalanceBefore, '10776816')
      })
    })
  })
})

async function changeSpotPrice (defaultPriceFeed, newSpotPrice) {
  await defaultPriceFeed.setRoundData({
    roundId: 1,
    answer: newSpotPrice,
    startedAt: await getTimestamp(),
    updatedAt: await getTimestamp() + 1,
    answeredInRound: 1
  })
}
