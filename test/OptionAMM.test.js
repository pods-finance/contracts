const { expect } = require('chai')
const BigNumber = require('bignumber.js')
const forceExpiration = require('./util/forceExpiration')
const forceEndOfExerciseWindow = require('./util/forceEndOfExerciseWindow')
const getTimestamp = require('./util/getTimestamp')
const deployBlackScholes = require('./util/deployBlackScholes')
const getPriceProviderMock = require('./util/getPriceProviderMock')
const createNewOption = require('./util/createNewOption')

const OPTION_TYPE_PUT = 0

const scenarios = [
  {
    name: 'WBTC/USDC',
    underlyingAssetSymbol: 'WBTC',
    underlyingAssetDecimals: 8,
    strikeAssetSymbol: 'USDC',
    strikeAssetDecimals: 6,
    strikePrice: ethers.BigNumber.from(5000e6.toString()),
    strikePriceDecimals: 6,
    amountToMint: ethers.BigNumber.from(1e8.toString()),
    amountToMintTooLow: 1,
    amountOfStableToAddLiquidity: ethers.BigNumber.from(1e8.toString()),
    initialFImp: ethers.BigNumber.from('10').pow(54),
    initialSpotPrice: '900000000000',
    volatilityIntensity: 'low'
  }
]

scenarios.forEach(scenario => {
  describe('OptionAMM.sol - ' + scenario.name, () => {
    const TEN = ethers.BigNumber.from('10')
    let mockUnderlyingAsset
    let mockStrikeAsset
    let factoryContract
    let priceProviderMock
    let blackScholes
    let sigma
    let podPut
    let podPutAddress
    let optionAMM
    let deployer
    let deployerAddress
    let second
    let secondAddress
    let buyer
    let buyerAddress
    let delegator
    let delegatorAddress

    async function MintPhase (amountOfOptionsToMint, signer = deployer, owner = deployerAddress) {
      const amountToMintBN = ethers.BigNumber.from(amountOfOptionsToMint)
      const optionsDecimals = await podPut.decimals()
      await mockStrikeAsset.connect(signer).approve(podPut.address, ethers.constants.MaxUint256)
      // calculate amount of Strike necessary to mint
      await mockStrikeAsset.connect(signer).mint(scenario.strikePrice.mul(amountOfOptionsToMint))

      await podPut.connect(signer).mint(amountToMintBN.mul(10 ** optionsDecimals), owner)
    }

    async function mintAndAddLiquidity (optionsAmount, stableAmount, signer = deployer, owner = deployerAddress) {
      const optionWithDecimals = ethers.BigNumber.from(optionsAmount).mul(TEN.pow(scenario.underlyingAssetDecimals))
      await MintPhase(optionsAmount, signer, owner)
      await mockStrikeAsset.connect(signer).mint(stableAmount)
      // Approve both Option and Stable Token
      await mockStrikeAsset.connect(signer).approve(optionAMM.address, ethers.constants.MaxUint256)
      await podPut.connect(signer).approve(optionAMM.address, ethers.constants.MaxUint256)

      const optionsDecimals = await podPut.decimals()
      const stableDecimals = await mockStrikeAsset.decimals()
      await optionAMM.connect(signer).addLiquidity(scenario.amountOfStableToAddLiquidity, optionWithDecimals)
    }

    before(async function () {
      let ContractFactory, MockERC20, MockWETH, Sigma
      [deployer, second, buyer, delegator] = await ethers.getSigners()
      deployerAddress = await deployer.getAddress()
      secondAddress = await second.getAddress()
      buyerAddress = await buyer.getAddress()
      delegatorAddress = await delegator.getAddress()

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
        await getTimestamp() + 5 * 60 * 60 * 1000,
        24 * 60 * 60)

      const mock = await getPriceProviderMock(deployer, scenario.initialSpotPrice, mockUnderlyingAsset.address)
      priceProviderMock = mock.priceProvider
    })

    beforeEach(async function () {
      // 1) Deploy OptionAMM
      const OptionAMM = await ethers.getContractFactory('OptionAMM')
      optionAMM = await OptionAMM.deploy(podPut.address, mockStrikeAsset.address, priceProviderMock.address, blackScholes.address, sigma.address)

      await optionAMM.deployed()
    })

    describe('Constructor/Initialization checks', () => {
      it('should have correct option data (strikePrice, expiration, strikeAsset)', async () => {
        expect(await optionAMM.tokenB()).to.equal(mockStrikeAsset.address)
        expect(await optionAMM.tokenA()).to.equal(podPut.address)
        expect(await optionAMM.priceProvider()).to.equal(priceProviderMock.address)

        const optionExpiration = await podPut.expiration()
        const optionStrikePrice = await podPut.strikePrice()
        const priceProperties = await optionAMM.priceProperties()

        expect(priceProperties.expiration).to.equal(optionExpiration)
        expect(priceProperties.strikePrice).to.equal(optionStrikePrice)
      })
    })

    describe('Add Liquidity', () => {
      it('should revert if user dont supply liquidity of both assets', async () => {
        await expect(optionAMM.addLiquidity(0, 10000)).to.be.revertedWith('ou should add both tokens on the first liquidity')
      })

      it('should revert if user ask more assets to it has in balance', async () => {
        await expect(optionAMM.addLiquidity(1000, 10000)).to.be.revertedWith('ERC20: transfer amount exceeds balance')
      })

      it('should revert if user do not approved one of assets to be spended by OptionAMM', async () => {
        // Mint option and Stable asset to the liquidity adder
        await MintPhase(1)
        await mockStrikeAsset.mint(scenario.amountOfStableToAddLiquidity)
        const optionBalance = await podPut.balanceOf(deployerAddress)
        await expect(optionAMM.addLiquidity(scenario.amountOfStableToAddLiquidity, optionBalance.toString())).to.be.revertedWith('ERC20: transfer amount exceeds allowance')
      })
    })

    describe('Buy', () => {
      // })
    })
    describe('Sell', () => {
    })
  })
})
