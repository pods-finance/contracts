const { expect } = require('chai')
const BigNumber = require('bignumber.js')
const forceExpiration = require('./util/forceExpiration')
const forceEndOfExerciseWindow = require('./util/forceEndOfExerciseWindow')
const getTimestamp = require('./util/getTimestamp')
const deployBlackScholes = require('./util/deployBlackScholes')
const getPriceProviderMock = require('./util/getPriceProviderMock')
const createNewOption = require('./util/createNewOption')
const { toBigNumber, approximately } = require('../utils/utils')

const OPTION_TYPE_PUT = 0

const scenarios = [
  // {
  //   name: 'WBTC/USDC',
  //   underlyingAssetSymbol: 'WBTC',
  //   underlyingAssetDecimals: 8,
  //   expiration: 1604044800,
  //   strikeAssetSymbol: 'USDC',
  //   strikeAssetDecimals: 6,
  //   strikePrice: ethers.BigNumber.from(5000e6.toString()),
  //   strikePriceDecimals: 6,
  //   amountToMint: ethers.BigNumber.from(1e8.toString()),
  //   amountToMintTooLow: 1,
  //   amountOfStableToAddLiquidity: ethers.BigNumber.from(1e8.toString()),
  //   initialFImp: ethers.BigNumber.from('10').pow(54),
  //   initialSpotPrice: ethers.BigNumber.from('36673000000'),
  //   spotPriceDecimals: 8,
  //   initialSigma: '100000000000'
  // },
  {
    name: 'WETH/USDC',
    underlyingAssetSymbol: 'WETH',
    underlyingAssetDecimals: 18,
    expiration: 1604044800,
    strikeAssetSymbol: 'USDC',
    strikeAssetDecimals: 6,
    strikePrice: toBigNumber(320e6),
    strikePriceDecimals: 6,
    amountToMint: ethers.BigNumber.from(1e8.toString()),
    amountToMintTooLow: 1,
    amountOfStableToAddLiquidity: ethers.BigNumber.from(1e8.toString()),
    initialFImp: ethers.BigNumber.from('10').pow(54),
    initialSpotPrice: toBigNumber(375e8),
    spotPriceDecimals: 8,
    initialSigma: toBigNumber(0.661e18),
    expectedNewIV: toBigNumber(0.66615e18)

  }
]

scenarios.forEach(scenario => {
  describe('OptionAMMPool.sol - ' + scenario.name, () => {
    const TEN = ethers.BigNumber.from('10')
    let mockUnderlyingAsset
    let mockStrikeAsset
    let factoryContract
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
      await mockStrikeAsset.connect(signer).mint(scenario.strikePrice.mul(amountOfOptionsToMint))

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
      let ContractFactory, MockERC20, MockWETH, Sigma
      [deployer, second, buyer, delegator, lp] = await ethers.getSigners()
      deployerAddress = await deployer.getAddress()
      secondAddress = await second.getAddress()
      buyerAddress = await buyer.getAddress()
      delegatorAddress = await delegator.getAddress()
      lpAddress = await lp.getAddress()

      // 1) Deploy Option
      // 2) Use same strike Asset
      ;[ContractFactory, MockERC20, MockWETH, blackScholes, Sigma] = await Promise.all([
        ethers.getContractFactory('OptionFactory'),
        ethers.getContractFactory('MintableERC20'),
        ethers.getContractFactory('WETH'),
        deployBlackScholes(),
        ethers.getContractFactory('Sigma')
      ])

      const mockWeth = await MockWETH.deploy()
      sigma = await Sigma.deploy(blackScholes.address)

      ;[factoryContract, mockUnderlyingAsset, mockStrikeAsset] = await Promise.all([
        ContractFactory.deploy(mockWeth.address),
        MockERC20.deploy(scenario.underlyingAssetSymbol, scenario.underlyingAssetSymbol, scenario.underlyingAssetDecimals),
        MockERC20.deploy(scenario.strikeAssetSymbol, scenario.strikeAssetSymbol, scenario.strikeAssetDecimals)
      ])
      // Deploy option
      podPut = await createNewOption(deployerAddress, factoryContract, 'pod:WBTC:USDC:5000:A',
        'pod:WBTC:USDC:5000:A',
        OPTION_TYPE_PUT,
        mockUnderlyingAsset.address,
        mockStrikeAsset.address,
        scenario.strikePrice,
        scenario.expiration,
        24 * 60 * 60)

      const mock = await getPriceProviderMock(deployer, scenario.initialSpotPrice, scenario.spotPriceDecimals, mockUnderlyingAsset.address)
      priceProviderMock = mock.priceProvider
      // 1) Deploy optionAMMPool
      const OptionAMMPool = await ethers.getContractFactory('OptionAMMPool')
      optionAMMPool = await OptionAMMPool.deploy(podPut.address, mockStrikeAsset.address, priceProviderMock.address, blackScholes.address, sigma.address, scenario.initialSigma)

      await optionAMMPool.deployed()
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
        const spotPrice = await optionAMMPool._getSpotPrice(mockUnderlyingAsset.address, 18)
        const bsDecimals = await optionAMMPool.BS_RES_DECIMALS()
        expect(spotPrice).to.equal(scenario.initialSpotPrice.mul(toBigNumber(10).pow(bsDecimals.sub(scenario.spotPriceDecimals))))
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
        await mockStrikeAsset.mint(scenario.amountOfStableToAddLiquidity)
        const optionBalance = await podPut.balanceOf(deployerAddress)
        await expect(optionAMMPool.addLiquidity(scenario.amountOfStableToAddLiquidity, optionBalance.toString())).to.be.revertedWith('ERC20: transfer amount exceeds allowance')
      })
    })

    describe('tradeExactAInput', () => {
      it('should match values accordingly', async () => {
        const amountOfStrikeLpNeed = toBigNumber(6000).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
        const amountOfStrikeLpToMintOption = scenario.strikePrice.mul(toBigNumber(100))
        const amountOfOptionsToMint = toBigNumber(100).mul(toBigNumber(10).pow(toBigNumber(scenario.underlyingAssetDecimals)))
        const initialBuyerBalanceStrikeAsset = toBigNumber(100).mul(toBigNumber(10).pow(scenario.strikeAssetDecimals))
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
          },
          {
            name: 'tradeExactAOutput',
            contract: optionAMMPool,
            user: buyer,
            params: [numberOfOptionsToBuy, ethers.constants.MaxUint256, buyerAddress, scenario.initialSigma]
          }
        ]

        const fnActions = actions.map(action => {
          const fn = async () => action.contract.connect(action.user)[action.name](...action.params)
          return fn
        })

        for (const fn of fnActions) {
          await fn()
        }

        // const balanceAfterTokenAPool = await mockTokenA.balanceOf(amm.address)
        // const balanceAfterTokenBPool = await mockTokenB.balanceOf(amm.address)
        //
        const balanceAfterOptionBuyer = await podPut.balanceOf(buyerAddress)
        const balanceAfterStrikeBuyer = await mockStrikeAsset.balanceOf(buyerAddress)

        expect(balanceAfterOptionBuyer).to.eq(numberOfOptionsToBuy)
      })
    })
    describe('Sell', () => {
    })
  })
})
