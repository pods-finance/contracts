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
      console.log('options decimasl', optionsDecimals.toString())
      console.log('amount of options added w/ decimals', optionWithDecimals.toString())
      console.log('amount of options added wo/ decimals', ethers.BigNumber.from(optionWithDecimals).div(TEN.pow(optionsDecimals)).toString())
      console.log('stable decimasl', stableDecimals.toString())
      console.log('amount of Stable w/ decimals', scenario.amountOfStableToAddLiquidity.toString())
      console.log('amount of Stable added wo/ decimals', ethers.BigNumber.from(scenario.amountOfStableToAddLiquidity).div(TEN.pow(stableDecimals)).toString())
      await optionAMM.connect(signer).addLiquidity(scenario.amountOfStableToAddLiquidity, optionWithDecimals)
    }

    before(async function () {
      let ContractFactory, MockERC20, MockWETH
      [deployer, second, buyer, delegator] = await ethers.getSigners()
      deployerAddress = await deployer.getAddress()
      secondAddress = await second.getAddress()
      buyerAddress = await buyer.getAddress()
      delegatorAddress = await delegator.getAddress()

      // 1) Deploy Option
      // 2) Use same strike Asset
      ;[ContractFactory, MockERC20, MockWETH, blackScholes] = await Promise.all([
        ethers.getContractFactory('OptionFactory'),
        ethers.getContractFactory('MintableERC20'),
        ethers.getContractFactory('WETH'),
        deployBlackScholes()
      ])

      const mockWeth = await MockWETH.deploy()

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
      optionAMM = await OptionAMM.deploy(podPut.address, mockStrikeAsset.address, priceProviderMock.address, blackScholes.address)

      await optionAMM.deployed()
    })

    describe('Constructor/Initialization checks', () => {
      it('should have correct option data (strikePrice, expiration, strikeAsset)', async () => {
        expect(await optionAMM.stableAsset()).to.equal(mockStrikeAsset.address)
        expect(await optionAMM.option()).to.equal(podPut.address)
        expect(await optionAMM.priceProvider()).to.equal(priceProviderMock.address)

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

      it('should add N+1 liquidity and update user balance accordingly', async () => {
        // Mint option and Stable asset to the liquidity adder
        await mintAndAddLiquidity(1, scenario.amountOfStableToAddLiquidity)
        await mintAndAddLiquidity(2, scenario.amountOfStableToAddLiquidity.mul(2), second, secondAddress)

        const userBalance = await optionAMM.balances(secondAddress)
        console.log('userBalance')
        console.log(userBalance)
        // expect(userBalance.optionBalance).to.be.equal(optionBalance)
        // expect(userBalance.stableBalance).to.be.equal(scenario.amountOfStableToAddLiquidity)
        // expect(userBalance.fImp).to.be.equal(scenario.initialFImp)
      })
    })

    describe('Remove Liquidity', () => {
      it('should remove liquidity completely', async () => {
        // Mint option and Stable asset to the liquidity adder
        const optionsToAddLiquidity = ethers.BigNumber.from('10').mul(TEN.pow(scenario.underlyingAssetDecimals))

        await mintAndAddLiquidity(10, scenario.amountOfStableToAddLiquidity)

        const amountOfStablePoolBefore = await mockStrikeAsset.balanceOf(optionAMM.address)
        const amountOfOptionPoolBefore = await podPut.balanceOf(optionAMM.address)

        const amountOfOptionUserBefore = await podPut.balanceOf(deployerAddress)
        const amountOfStableUserBefore = await mockStrikeAsset.balanceOf(deployerAddress)

        const userBalanceBefore = await optionAMM.balances(deployerAddress)
        // console.log(userBalance)

        const amountToRemoveOptions = optionsToAddLiquidity

        await optionAMM.removeLiquidity(scenario.amountOfStableToAddLiquidity, amountToRemoveOptions)

        // const userBalance = await optionAMM.balances(secondAddress)
        // console.log('userBalance')
        // console.log(userBalance)
        // expect(userBalance.optionBalance).to.be.equal(optionBalance)
        // expect(userBalance.stableBalance).to.be.equal(scenario.amountOfStableToAddLiquidity)
        // expect(userBalance.fImp).to.be.equal(scenario.initialFImp)
      })
    })

    describe('Buy', () => {
      // it('should buy and update balances accordingly', async () => {
      //   // Mint option and Stable asset to the liquidity adder
      //   await MintPhase(1)
      //   await mockStrikeAsset.mint(scenario.amountOfStableToAddLiquidity)
      //   const optionBalance = await podPut.balanceOf(deployerAddress)

      //   // Approve both Option and Stable Token
      //   await mockStrikeAsset.approve(optionAMM.address, ethers.constants.MaxUint256)
      //   await podPut.approve(optionAMM.address, ethers.constants.MaxUint256)

      //   await optionAMM.addLiquidity(scenario.amountOfStableToAddLiquidity, optionBalance.toString())

      //   const userBalance = await optionAMM.balances(deployerAddress)
      //   expect(userBalance.optionBalance).to.be.equal(optionBalance)
      //   expect(userBalance.stableBalance).to.be.equal(scenario.amountOfStableToAddLiquidity)
      //   expect(userBalance.fImp).to.be.equal(scenario.initialFImp)

      //   // Approve both Option and Stable Token
      //   await mockStrikeAsset.mint(scenario.amountOfStableToAddLiquidity)
      //   await mockStrikeAsset.connect(second).approve(optionAMM.address, ethers.constants.MaxUint256)

      //   await optionAMM.connect(second).buyExact(1, 100000, 1000000)
      // })
    })
    describe('Sell', () => {
    })
  })
})
