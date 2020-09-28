const { expect } = require('chai')
const BigNumber = require('bignumber.js')
const forceExpiration = require('./util/forceExpiration')
const forceEndOfExerciseWindow = require('./util/forceEndOfExerciseWindow')
const getTimestamp = require('./util/getTimestamp')

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
    amountOfStableToAddLiquidity: 1e8,
    initialFImp: ethers.BigNumber.from('10').pow(54)
  }
]

scenarios.forEach(scenario => {
  describe('OptionAMM.sol - ' + scenario.name, () => {
    let mockUnderlyingAsset
    let mockStrikeAsset
    let factoryContract
    let priceProvider
    let priceProviderAddress
    let podPut
    let podPutAddress
    let optionAMM
    let deployer
    let deployerAddress
    let seller
    let sellerAddress
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

    before(async function () {
      [deployer, seller, buyer, delegator] = await ethers.getSigners()
      deployerAddress = await deployer.getAddress()
      sellerAddress = await seller.getAddress()
      buyerAddress = await buyer.getAddress()
      delegatorAddress = await delegator.getAddress()

      // 1) Deploy Option
      // 2) Use same strike Asset
      const MockERC20 = await ethers.getContractFactory('MintableERC20')
      const ContractFactory = await ethers.getContractFactory('OptionFactory')
      const MockWETH = await ethers.getContractFactory('WETH')

      const mockWeth = await MockWETH.deploy()
      factoryContract = await ContractFactory.deploy(mockWeth.address)
      mockUnderlyingAsset = await MockERC20.deploy(scenario.underlyingAssetSymbol, scenario.underlyingAssetSymbol, scenario.underlyingAssetDecimals)
      mockStrikeAsset = await MockERC20.deploy(scenario.strikeAssetSymbol, scenario.strikeAssetSymbol, scenario.strikeAssetDecimals)

      // call transaction
      const txIdNewOption = await factoryContract.createOption(
        'pod:WBTC:USDC:5000:A',
        'pod:WBTC:USDC:5000:A',
        OPTION_TYPE_PUT,
        mockUnderlyingAsset.address,
        mockStrikeAsset.address,
        scenario.strikePrice,
        await getTimestamp() + 5 * 60 * 60 * 1000,
        24 * 60 * 60 // 24h
      )

      const filterFrom = await factoryContract.filters.OptionCreated(deployerAddress)
      const eventDetails = await factoryContract.queryFilter(filterFrom, txIdNewOption.blockNumber, txIdNewOption.blockNumber)

      if (eventDetails.length) {
        const { option } = eventDetails[0].args
        podPut = await ethers.getContractAt('PodPut', option)
        podPutAddress = podPut.address
      } else {
        console.log('Something went wrong: No events found')
      }

      await podPut.deployed()

      // 2) Deploy Price Provider
      const PriceProvider = await ethers.getContractFactory('PriceProvider')
      priceProvider = await PriceProvider.deploy([], [])
      await priceProvider.deployed()
      priceProviderAddress = priceProvider.address
    })

    beforeEach(async function () {
      // 1) Deploy OptionAMM
      const OptionAMM = await ethers.getContractFactory('OptionAMM')
      optionAMM = await OptionAMM.deploy(podPutAddress, mockStrikeAsset.address, priceProviderAddress)
      await optionAMM.deployed()
    })

    describe('Constructor/Initialization checks', () => {
      it('should have correct option data (strikePrice, expiration, strikeAsset)', async () => {
        expect(await optionAMM.stableAsset()).to.equal(mockStrikeAsset.address)
        expect(await optionAMM.option()).to.equal(podPut.address)
        expect(await optionAMM.priceProvider()).to.equal(priceProviderAddress)

        const optionExpiration = await podPut.expiration()
        const optionStrikePrice = await podPut.strikePrice()
        expect(await optionAMM.expiration()).to.equal(optionExpiration)
        expect(await optionAMM.strikePrice()).to.equal(optionStrikePrice)
      })
    })

    describe('Add Liquidity', () => {
      it('should revert if user dont supply liquidity of both assets', async () => {
        await expect(optionAMM.addLiquidity(0, 10000)).to.be.revertedWith('You should add both tokens on first liquidity')
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

      it('should add first liquidity and update user balance accordingly', async () => {
        // Mint option and Stable asset to the liquidity adder
        await MintPhase(1)
        await mockStrikeAsset.mint(scenario.amountOfStableToAddLiquidity)
        const optionBalance = await podPut.balanceOf(deployerAddress)

        // Approve both Option and Stable Token
        await mockStrikeAsset.approve(optionAMM.address, ethers.constants.MaxUint256)
        await podPut.approve(optionAMM.address, ethers.constants.MaxUint256)

        await optionAMM.addLiquidity(scenario.amountOfStableToAddLiquidity, optionBalance.toString())

        const userBalance = await optionAMM.balances(deployerAddress)
        expect(userBalance.optionBalance).to.be.equal(optionBalance)
        expect(userBalance.stableBalance).to.be.equal(scenario.amountOfStableToAddLiquidity)
        expect(userBalance.fImp).to.be.equal(scenario.initialFImp)
      })
    })

    describe('Remove Liquidity', () => {
    })

    describe('Buy', () => {

    })
    describe('Sell', () => {
    })
  })
})
