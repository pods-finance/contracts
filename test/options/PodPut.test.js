const { ethers } = require('hardhat')
const { expect } = require('chai')
const getTimestamp = require('../util/getTimestamp')
const skipToWithdrawWindow = require('../util/skipToWithdrawWindow')
const skipToExerciseWindow = require('../util/skipToExerciseWindow')
const { takeSnapshot, revertToSnapshot } = require('../util/snapshot')
const createConfigurationManager = require('../util/createConfigurationManager')

const EXERCISE_TYPE_EUROPEAN = 0
const EXERCISE_TYPE_AMERICAN = 1

const scenarios = [
  {
    name: 'WETH/USDC',
    underlyingAssetSymbol: 'WETH',
    underlyingAssetDecimals: 18,
    strikeAssetSymbol: 'USDC',
    strikeAssetDecimals: 6,
    strikePrice: ethers.BigNumber.from(1500e6.toString()),
    amountToMint: ethers.BigNumber.from(1e18.toString()),
    amountToMintTooLow: 1,
    cap: ethers.BigNumber.from(20e8.toString())
  },
  {
    name: 'WBTC/aDAI',
    underlyingAssetSymbol: 'WBTC',
    underlyingAssetDecimals: 8,
    strikeAssetSymbol: 'aDAI',
    strikeAssetDecimals: 18,
    strikePrice: ethers.BigNumber.from(7000).mul(ethers.BigNumber.from(10).pow(18)),
    strikePriceDecimals: 18,
    amountToMint: ethers.BigNumber.from(1e8.toString()),
    amountToMintTooLow: 1,
    cap: ethers.BigNumber.from(20e8.toString())
  }
]

scenarios.forEach(scenario => {
  describe('PodPut.sol - ' + scenario.name, () => {
    let mockUnderlyingAsset
    let mockStrikeAsset
    let configurationManager
    let PodPut
    let podPut
    let deployer
    let deployerAddress
    let seller
    let another
    let anotherAddress
    let sellerAddress
    let buyer
    let buyerAddress
    let snapshotId
    let MockInterestBearingERC20
    let podPutAmerican

    before(async function () {
      [deployer, seller, buyer, another] = await ethers.getSigners()
      deployerAddress = await deployer.getAddress()
      sellerAddress = await seller.getAddress()
      buyerAddress = await buyer.getAddress()
      anotherAddress = await another.getAddress()

      ;[MockInterestBearingERC20, PodPut] = await Promise.all([
        ethers.getContractFactory('MintableInterestBearing'),
        ethers.getContractFactory('PodPut')
      ])

      mockUnderlyingAsset = await MockInterestBearingERC20.deploy(scenario.underlyingAssetSymbol, scenario.underlyingAssetSymbol, scenario.underlyingAssetDecimals)
      mockStrikeAsset = await MockInterestBearingERC20.deploy(scenario.strikeAssetSymbol, scenario.strikeAssetSymbol, scenario.strikeAssetDecimals)

      configurationManager = await createConfigurationManager()
    })

    beforeEach(async function () {
      snapshotId = await takeSnapshot()

      podPut = await PodPut.deploy(
        scenario.name,
        scenario.name,
        EXERCISE_TYPE_EUROPEAN,
        mockUnderlyingAsset.address,
        mockStrikeAsset.address,
        scenario.strikePrice,
        await getTimestamp() + 24 * 60 * 60 * 7,
        24 * 60 * 60, // 24h
        configurationManager.address
      )
    })

    afterEach(async () => {
      await revertToSnapshot(snapshotId)
    })

    async function MintPhase (amountOfOptionsToMint, signer = seller, owner = sellerAddress) {
      const signerAddress = await signer.getAddress()
      expect(await podPut.balanceOf(signerAddress)).to.equal(0)
      const optionsDecimals = await podPut.decimals()
      await mockStrikeAsset.connect(signer).approve(podPut.address, ethers.constants.MaxUint256)
      // calculate amount of Strike necessary to mint
      await mockStrikeAsset.connect(signer).mint(scenario.strikePrice.mul(amountOfOptionsToMint).div(ethers.BigNumber.from(10).pow(optionsDecimals)))

      expect(await mockStrikeAsset.balanceOf(signerAddress)).to.equal(scenario.strikePrice.mul(amountOfOptionsToMint).div(ethers.BigNumber.from(10).pow(optionsDecimals)))
      await podPut.connect(signer).mint(amountOfOptionsToMint, owner)
      expect(await podPut.balanceOf(signerAddress)).to.equal(amountOfOptionsToMint)
      expect(await mockStrikeAsset.balanceOf(signerAddress)).to.equal(0)
    }

    async function ExercisePhase (amountOfOptionsToExercise, signer = seller, receiver = buyer, receiverAddress = buyerAddress) {
      await podPut.connect(signer).transfer(receiverAddress, amountOfOptionsToExercise)
      await mockUnderlyingAsset.connect(receiver).mint(scenario.amountToMint)
      await mockUnderlyingAsset.connect(receiver).approve(podPut.address, ethers.constants.MaxUint256)
      await podPut.connect(receiver).exercise(amountOfOptionsToExercise)
    }

    describe('Constructor/Initialization checks', () => {
      it('should have correct number of decimals for underlying and strike asset', async () => {
        expect(await podPut.strikeAssetDecimals()).to.equal(scenario.strikeAssetDecimals)
        expect(await podPut.underlyingAssetDecimals()).to.equal(scenario.underlyingAssetDecimals)
      })

      it('should have correct exercise type', async () => {
        expect(await podPut.exerciseType()).to.equal(EXERCISE_TYPE_EUROPEAN)
      })

      it('should have equal number of decimals podPut and underlyingAsset', async () => {
        expect(await podPut.decimals()).to.equal(scenario.underlyingAssetDecimals)
      })

      it('should have equal number of decimals StrikePrice and strikeAsset', async () => {
        expect(await podPut.strikePriceDecimals()).to.equal(await podPut.strikeAssetDecimals())
      })

      it('should not allow underlyingAsset/strikeAsset with 0x0 address', async () => {
        podPut = PodPut.deploy(
          'pod:WBTC:USDC:5000:A',
          'pod:WBTC:USDC:5000:A',
          EXERCISE_TYPE_EUROPEAN,
          ethers.constants.AddressZero,
          mockStrikeAsset.address,
          scenario.strikePrice,
          await getTimestamp() + 24 * 60 * 60,
          24 * 60 * 60, // 24h
          configurationManager.address
        )
        await expect(podPut).to.revertedWith('PodOption: underlying asset is not a contract')

        podPut = PodPut.deploy(
          'pod:WBTC:USDC:5000:A',
          'pod:WBTC:USDC:5000:A',
          EXERCISE_TYPE_EUROPEAN,
          mockUnderlyingAsset.address,
          ethers.constants.AddressZero,
          scenario.strikePrice,
          await getTimestamp() + 24 * 60 * 60,
          24 * 60 * 60, // 24h
          configurationManager.address
        )
        await expect(podPut).to.revertedWith('PodOption: strike asset is not a contract')
      })

      it('should not allow underlyingAsset/strikeAsset that are not contracts', async () => {
        podPut = PodPut.deploy(
          'pod:WBTC:USDC:5000:A',
          'pod:WBTC:USDC:5000:A',
          EXERCISE_TYPE_EUROPEAN,
          sellerAddress,
          mockStrikeAsset.address,
          scenario.strikePrice,
          await getTimestamp() + 24 * 60 * 60,
          24 * 60 * 60, // 24h
          configurationManager.address
        )
        await expect(podPut).to.revertedWith('PodOption: underlying asset is not a contract')

        podPut = PodPut.deploy(
          'pod:WBTC:USDC:5000:A',
          'pod:WBTC:USDC:5000:A',
          EXERCISE_TYPE_EUROPEAN,
          mockUnderlyingAsset.address,
          sellerAddress,
          scenario.strikePrice,
          await getTimestamp() + 24 * 60 * 60,
          24 * 60 * 60, // 24h
          configurationManager.address
        )
        await expect(podPut).to.revertedWith('PodOption: strike asset is not a contract')
      })

      it('should not allow for underlyingAsset and strikeAsset to be the same address', async () => {
        podPut = PodPut.deploy(
          'pod:WBTC:USDC:5000:A',
          'pod:WBTC:USDC:5000:A',
          EXERCISE_TYPE_EUROPEAN,
          mockStrikeAsset.address,
          mockStrikeAsset.address,
          scenario.strikePrice,
          await getTimestamp() + 24 * 60 * 60,
          24 * 60 * 60, // 24h
          configurationManager.address
        )
        await expect(podPut).to.revertedWith('PodOption: underlying asset and strike asset must differ')
      })

      it('should only allow expiration in the future', async () => {
        podPut = PodPut.deploy(
          'pod:WBTC:USDC:5000:A',
          'pod:WBTC:USDC:5000:A',
          EXERCISE_TYPE_EUROPEAN,
          mockUnderlyingAsset.address,
          mockStrikeAsset.address,
          scenario.strikePrice,
          await getTimestamp(),
          24 * 60 * 60, // 24h
          configurationManager.address
        )
        await expect(podPut).to.revertedWith('PodOption: expiration should be in the future')
      })

      it('should not allow strikePrice lesser than or equal 0', async () => {
        podPut = PodPut.deploy(
          'pod:WBTC:USDC:5000:A',
          'pod:WBTC:USDC:5000:A',
          EXERCISE_TYPE_EUROPEAN,
          mockUnderlyingAsset.address,
          mockStrikeAsset.address,
          0,
          await getTimestamp() + 24 * 60 * 60,
          24 * 60 * 60, // 24h
          configurationManager.address
        )
        await expect(podPut).to.revertedWith('PodOption: strike price must be greater than zero')
      })

      it('should not allow exercise windows shorter than 24 hours if EUROPEAN option', async () => {
        podPut = PodPut.deploy(
          'pod:WBTC:USDC:5000:A',
          'pod:WBTC:USDC:5000:A',
          EXERCISE_TYPE_EUROPEAN,
          mockUnderlyingAsset.address,
          mockStrikeAsset.address,
          scenario.strikePrice,
          await getTimestamp() + 24 * 60 * 60,
          (24 * 60 * 60) - 1, // 24h - 1 second
          configurationManager.address
        )
        await expect(podPut).to.revertedWith('PodOption: exercise window must be greater than or equal 86400')
      })

      it('should not allow exercise window different than 0 if AMERICAN option', async () => {
        podPut = PodPut.deploy(
          'pod:WBTC:USDC:5000:A',
          'pod:WBTC:USDC:5000:A',
          EXERCISE_TYPE_AMERICAN,
          mockUnderlyingAsset.address,
          mockStrikeAsset.address,
          scenario.strikePrice,
          await getTimestamp() + 24 * 60 * 60,
          (24 * 60 * 60) - 1, // 24h - 1 second
          configurationManager.address
        )
        await expect(podPut).to.revertedWith('PodOption: exercise window size must be equal to zero')
      })

      it('should return right booleans if the option is expired or not', async () => {
        expect(await podPut.isExerciseWindow()).to.be.false
        expect(await podPut.isTradeWindow()).to.be.true
        expect(await podPut.hasExpired()).to.be.false
        expect(await podPut.isWithdrawWindow()).to.be.false

        await skipToExerciseWindow(podPut)

        expect(await podPut.isExerciseWindow()).to.be.true
        expect(await podPut.isTradeWindow()).to.be.false
        expect(await podPut.isWithdrawWindow()).to.be.false
        expect(await podPut.hasExpired()).to.be.false

        await skipToWithdrawWindow(podPut)

        expect(await podPut.isExerciseWindow()).to.be.false
        expect(await podPut.isTradeWindow()).to.be.false
        expect(await podPut.isWithdrawWindow()).to.be.true
        expect(await podPut.hasExpired()).to.be.true
      })

      it('should not allow underlyingAsset or strikeAsset decimals higher than 76', async () => {
        const mockUnderlying77Decimals = await MockInterestBearingERC20.deploy('Teste Token', 'TEST', '77')

        podPut = PodPut.deploy(
          'pod:WBTC:USDC:5000:A',
          'pod:WBTC:USDC:5000:A',
          EXERCISE_TYPE_EUROPEAN,
          mockUnderlying77Decimals.address,
          mockStrikeAsset.address,
          scenario.strikePrice,
          await getTimestamp() + 24 * 60 * 60,
          (24 * 60 * 60), // 24h - 1 second
          configurationManager.address
        )
        await expect(podPut).to.revertedWith('RequiredDecimals: token decimals should be lower than 77')

        const mockStrike77Decimals = await MockInterestBearingERC20.deploy('Teste Token', 'TEST', '77')

        podPut = PodPut.deploy(
          'pod:WBTC:USDC:5000:A',
          'pod:WBTC:USDC:5000:A',
          EXERCISE_TYPE_EUROPEAN,
          mockUnderlyingAsset.address,
          mockStrike77Decimals.address,
          scenario.strikePrice,
          await getTimestamp() + 24 * 60 * 60,
          (24 * 60 * 60), // 24h - 1 second
          configurationManager.address
        )
        await expect(podPut).to.revertedWith('RequiredDecimals: token decimals should be lower than 77')
      })
    })

    describe('Minting options', () => {
      it('should revert if user do not have enough collateral', async () => {
        expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(podPut.address, ethers.constants.MaxUint256)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)
        await expect(
          podPut.connect(seller).mint(scenario.amountToMint, sellerAddress)
        ).to.be.reverted
      })

      it('should revert if asked amount is too low', async () => {
        const minimumAmount = ethers.BigNumber.from(scenario.strikePrice).div((10 ** await mockUnderlyingAsset.decimals()).toString())

        if (minimumAmount.gt(0)) return

        expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(podPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)
        await expect(podPut.connect(seller).mint(scenario.amountToMintTooLow, sellerAddress)).to.be.revertedWith('PodOption: amount of options is too low')
      })

      it('should revert if amount of options asked is zero', async () => {
        await expect(podPut.connect(seller).mint(0, sellerAddress)).to.be.revertedWith('PodPut: you can not mint zero options')
      })

      it('should mint, and have right number when checking for users balances', async () => {
        expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(podPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        await podPut.connect(seller).mint(scenario.amountToMint, sellerAddress)
        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)

        const funds = await podPut.connect(seller).getSellerWithdrawAmounts(sellerAddress)
        expect(funds.underlyingAmount).to.be.equal(0)
        expect(funds.strikeAmount).to.be.gte(scenario.strikePrice)
      })

      it('should not be able to mint more than the cap', async () => {
        const capProvider = await ethers.getContractAt('CapProvider', configurationManager.getCapProvider())
        capProvider.setCap(podPut.address, scenario.cap)

        expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

        const capSize = await podPut.capSize()
        const capExceeded = capSize.add(1)

        await mockStrikeAsset.connect(seller).approve(podPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(await podPut.strikeToTransfer(capExceeded))

        await expect(podPut.connect(seller).mint(capExceeded, sellerAddress))
          .to.be.revertedWith('CappedOption: amount exceed cap')
      })

      it('should mint, increase senders option balance and decrease sender strike balance', async () => {
        expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(podPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        await podPut.connect(seller).mint(scenario.amountToMint, sellerAddress)
        expect(await podPut.balanceOf(sellerAddress)).to.equal(scenario.amountToMint)
        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)
      })

      it('should mint rounding up the value to receive, and round down the value sent, in order to avoid locked funds - multiple users', async () => {
        const specificScenario = {
          name: 'BRL/USDC',
          underlyingAssetSymbol: 'BRL',
          underlyingAssetDecimals: 2,
          strikeAssetSymbol: 'USDC',
          strikeAssetDecimals: 2,
          strikePrice: ethers.BigNumber.from(21)
        }

        const mockUnderlyingAsset = await MockInterestBearingERC20.deploy(specificScenario.underlyingAssetSymbol, specificScenario.underlyingAssetSymbol, specificScenario.underlyingAssetDecimals)
        const mockStrikeAsset = await MockInterestBearingERC20.deploy(specificScenario.strikeAssetSymbol, specificScenario.strikeAssetSymbol, specificScenario.strikeAssetDecimals)

        await mockUnderlyingAsset.deployed()
        await mockStrikeAsset.deployed()

        podPut = await PodPut.deploy(
          'pod:BRL:USDC:0.21',
          'pod:BRL:USDC:0.21',
          EXERCISE_TYPE_EUROPEAN,
          mockUnderlyingAsset.address,
          mockStrikeAsset.address,
          specificScenario.strikePrice,
          await getTimestamp() + 24 * 60 * 60 * 7,
          24 * 60 * 60, // 24h
          configurationManager.address
        )
        await podPut.deployed()

        const amountToMint = ethers.BigNumber.from(1000099)

        expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(podPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint('1000000000000000')

        await podPut.connect(seller).mint(amountToMint, sellerAddress)
        await podPut.connect(seller).mint(amountToMint, sellerAddress)

        await skipToWithdrawWindow(podPut)
        await expect(podPut.connect(seller).withdraw()).to.not.be.reverted

        const balanceSellerOfStrikeAfter = await mockStrikeAsset.balanceOf(sellerAddress)
        expect(balanceSellerOfStrikeAfter).to.equal('1000000000000000')
      })

      it('should mint rounding up the value to receive, and round down the value sent, in order to avoid locked funds', async () => {
        const specificScenario = {
          name: 'BRL/USDC',
          underlyingAssetSymbol: 'BRL',
          underlyingAssetDecimals: 2,
          strikeAssetSymbol: 'USDC',
          strikeAssetDecimals: 2,
          strikePrice: ethers.BigNumber.from(21)
        }

        const mockUnderlyingAsset = await MockInterestBearingERC20.deploy(specificScenario.underlyingAssetSymbol, specificScenario.underlyingAssetSymbol, specificScenario.underlyingAssetDecimals)
        const mockStrikeAsset = await MockInterestBearingERC20.deploy(specificScenario.strikeAssetSymbol, specificScenario.strikeAssetSymbol, specificScenario.strikeAssetDecimals)

        await mockUnderlyingAsset.deployed()
        await mockStrikeAsset.deployed()

        podPut = await PodPut.deploy(
          'pod:BRL:USDC:0.21',
          'pod:BRL:USDC:0.21',
          EXERCISE_TYPE_EUROPEAN,
          mockUnderlyingAsset.address,
          mockStrikeAsset.address,
          specificScenario.strikePrice,
          await getTimestamp() + 24 * 60 * 60 * 7,
          24 * 60 * 60, // 24h
          configurationManager.address
        )
        await podPut.deployed()

        const amountToMint = ethers.BigNumber.from(1000099)

        expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(podPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(buyer).approve(podPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint('1000000000000000')
        await mockStrikeAsset.connect(buyer).mint('1000000000000000')

        await podPut.connect(seller).mint(amountToMint, sellerAddress)
        await podPut.connect(buyer).mint(amountToMint, buyerAddress)
        await podPut.connect(seller).mint(amountToMint, sellerAddress)

        const contractBalanceOfStrike = await podPut.strikeReserves()
        const totalSupply = await podPut.totalSupply()
        // Check Option Balance
        // Check Contract Strike
        // expect(await podPut.balanceOf(sellerAddress)).to.equal(amountToMint.mul(2))

        await skipToWithdrawWindow(podPut)
        await expect(podPut.connect(seller).withdraw()).to.not.be.reverted
        await expect(podPut.connect(buyer).withdraw()).to.not.be.reverted

        const balanceSellerOfStrikeAfter = await mockStrikeAsset.balanceOf(sellerAddress)
        const balanceBuyerOfStrikeAfter = await mockStrikeAsset.balanceOf(buyerAddress)
        const balanceContractOfStrikeAfter = await podPut.strikeReserves()
        expect(balanceSellerOfStrikeAfter).to.equal('1000000000000000')
        expect(balanceBuyerOfStrikeAfter).to.equal('1000000000000000')
        expect(balanceContractOfStrikeAfter).to.equal(0)
      })

      it('should revert if user try to mint after expiration', async () => {
        expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(podPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint('1000000000000000000')

        await skipToWithdrawWindow(podPut)
        await expect(podPut.connect(seller).mint(scenario.amountToMint, sellerAddress)).to.be.revertedWith('PodOption: trade window has closed')
      })

      it('should not mint for the zero address behalf', async () => {
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)
        await mockStrikeAsset.connect(seller).approve(podPut.address, scenario.strikePrice)

        const tx = podPut.connect(seller).mint(scenario.amountToMint, ethers.constants.AddressZero)
        await expect(tx).to.be.revertedWith('PodOption: zero address cannot be the owner')
      })
    })

    describe('Exercising options', () => {
      it('should revert if amount of options asked is zero', async () => {
        await skipToExerciseWindow(podPut)
        await expect(podPut.connect(seller).exercise(ethers.BigNumber.from(0)))
          .to.be.revertedWith('PodPut: you can not exercise zero options')
      })

      it('should revert if user try to exercise before start of exercise window', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await podPut.connect(seller).transfer(buyerAddress, scenario.amountToMint)
        // Mint Underlying Asset
        await mockUnderlyingAsset.connect(buyer).mint(scenario.amountToMint)
        await expect(podPut.connect(seller).exercise(scenario.amountToMint)).to.be.revertedWith('PodOption: not in exercise window')
      })

      it('should revert if user have underlying approved, but do not have enough options', async () => {
        // Mint underlying
        await mockUnderlyingAsset.connect(buyer).mint(scenario.amountToMint)
        // Approve PodPut spend underlying asset
        await mockUnderlyingAsset.connect(buyer).approve(podPut.address, ethers.constants.MaxUint256)
        await skipToExerciseWindow(podPut)
        await expect(
          podPut.connect(buyer).exercise(scenario.amountToMint)
        ).to.be.revertedWith('ERC20: burn amount exceeds balance')
      })

      it('should revert if sender not have enough strike balance', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await podPut.connect(seller).transfer(buyerAddress, scenario.amountToMint)
        expect(await podPut.balanceOf(buyerAddress)).to.equal(scenario.amountToMint)
        // Approve PodPut spend underlying asset
        await mockUnderlyingAsset.connect(buyer).approve(podPut.address, ethers.constants.MaxUint256)
        await skipToExerciseWindow(podPut)
        await expect(
          podPut.connect(buyer).exercise(scenario.amountToMint)
        ).to.be.reverted
      })

      it('should exercise and have all final balances matched', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await podPut.connect(seller).transfer(buyerAddress, scenario.amountToMint)

        // Mint Underlying Asset
        await mockUnderlyingAsset.connect(buyer).mint(scenario.amountToMint)
        // Approve Underlying to be spent by contract
        await mockUnderlyingAsset.connect(buyer).approve(podPut.address, ethers.constants.MaxUint256)

        await skipToExerciseWindow(podPut)
        await podPut.connect(buyer).exercise(scenario.amountToMint)

        const finalBuyerOptionBalance = await podPut.balanceOf(buyerAddress)
        const finalBuyerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(buyerAddress)
        const finalContractUnderlyingReserves = await podPut.underlyingReserves()
        const finalContractStrikeReserves = await podPut.strikeReserves()
        const finalContractOptionSupply = await podPut.totalSupply()

        expect(finalBuyerOptionBalance).to.equal(0)
        expect(finalBuyerUnderlyingBalance).to.equal(0)
        expect(finalContractUnderlyingReserves).to.equal(scenario.amountToMint)
        expect(finalContractStrikeReserves).to.equal(0)
        expect(finalContractOptionSupply).to.equal(0)
      })

      it('should revert if user try to exercise after exercise window', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await podPut.connect(seller).transfer(buyerAddress, scenario.amountToMint)
        // Mint Underlying Asset
        await mockUnderlyingAsset.connect(buyer).mint(scenario.amountToMint)
        await skipToWithdrawWindow(podPut)
        await expect(podPut.connect(seller).exercise(scenario.amountToMint)).to.be.reverted
      })
    })

    describe('Unminting options', () => {
      it('should revert if try to unmint without amount', async () => {
        await expect(podPut.connect(seller).unmint(scenario.amountToMint)).to.be.revertedWith('PodOption: you do not have minted options')
      })

      it('should revert if try to unmint amount higher than possible', async () => {
        await MintPhase(scenario.amountToMint)
        await expect(podPut.connect(seller).unmint(scenario.amountToMint.mul(2))).to.be.revertedWith('PodOption: not enough minted options')
      })

      it('should revert if unmint amount is too low', async () => {
        await MintPhase(scenario.amountToMint)

        const ownerShares = await podPut.shares(sellerAddress)
        const userMintedOptions = await podPut.mintedOptions(sellerAddress)

        if (ownerShares.div(userMintedOptions).gt(1)) return
        await expect(podPut.connect(seller).unmint('1')).to.be.revertedWith('PodPut: amount of options is too low')
      })

      it('should unmint, destroy sender option, reduce its balance and send strike back', async () => {
        await MintPhase(scenario.amountToMint)
        const initialSellerOptionBalance = await podPut.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialContractUnderlyingReserves = await podPut.underlyingReserves()
        const initialContractStrikeReserves = await podPut.strikeReserves()
        const initialContractOptionSupply = await podPut.totalSupply()

        expect(initialSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialSellerStrikeBalance).to.equal(0)
        expect(initialContractUnderlyingReserves).to.equal(0)
        expect(initialContractStrikeReserves).to.equal(scenario.strikePrice)
        expect(initialContractOptionSupply).to.equal(scenario.amountToMint)
        await podPut.connect(seller).unmint(scenario.amountToMint)

        const finalSellerOptionBalance = await podPut.balanceOf(sellerAddress)
        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractUnderlyingReserves = await podPut.underlyingReserves()
        const finalContractStrikeReserves = await podPut.strikeReserves()
        const finalContractOptionSupply = await podPut.totalSupply()

        expect(finalSellerOptionBalance).to.equal(0)
        expect(finalSellerStrikeBalance).to.equal(scenario.strikePrice)
        expect(finalContractStrikeReserves).to.equal(0)
        expect(finalContractOptionSupply).to.equal(0)
        expect(finalContractUnderlyingReserves).to.equal(0)
      })

      it('should unmint, destroy seller option, reduce its balance and send strike back counting interests (Ma-Mb-UNa)', async () => {
        await MintPhase(scenario.amountToMint)
        await mockStrikeAsset.earnInterest(podPut.address)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)
        await mockStrikeAsset.earnInterest(podPut.address)

        const initialSellerOptionBalance = await podPut.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialContractUnderlyingReserves = await podPut.underlyingReserves()
        const initialContractStrikeReserves = await podPut.strikeReserves()
        const initialContractOptionSupply = await podPut.totalSupply()

        await podPut.connect(seller).unmint(scenario.amountToMint)

        const finalSellerOptionBalance = await podPut.balanceOf(sellerAddress)
        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractUnderlyingReserves = await podPut.underlyingReserves()
        const finalContractStrikeReserves = await podPut.strikeReserves()
        const finalContractOptionSupply = await podPut.totalSupply()

        expect(finalSellerOptionBalance).to.equal(initialSellerOptionBalance.sub(scenario.amountToMint))
        expect(finalSellerStrikeBalance).to.gte(initialSellerStrikeBalance.add(scenario.strikePrice))
        expect(finalContractStrikeReserves).to.gte(scenario.strikePrice)
        expect(finalContractOptionSupply).to.equal(initialContractOptionSupply.sub(scenario.amountToMint))
        expect(finalContractUnderlyingReserves).to.equal(initialContractUnderlyingReserves)
      })

      it('should unmint, destroy seller option, reduce its balance and send strike back counting interests (Ma-Mb-UNa-UNb)', async () => {
        await MintPhase(scenario.amountToMint)
        await mockStrikeAsset.earnInterest(podPut.address)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)
        await mockStrikeAsset.earnInterest(podPut.address)
        await expect(podPut.connect(seller).unmint(scenario.amountToMint))

        const initialContractUnderlyingReserves = await podPut.underlyingReserves()

        await expect(podPut.connect(buyer).unmint(scenario.amountToMint))

        const finalBuyerOptionBalance = await podPut.balanceOf(sellerAddress)
        const finalBuyerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractStrikeReserves = await podPut.strikeReserves()
        const finalContractOptionSupply = await podPut.totalSupply()
        const finalContractUnderlyingReserves = await podPut.underlyingReserves()

        expect(finalBuyerOptionBalance).to.equal(0)
        expect(finalBuyerStrikeBalance).to.gte(scenario.strikePrice) // earned interests
        expect(finalContractStrikeReserves).to.equal(0)
        expect(finalContractOptionSupply).to.equal(0)
        expect(finalContractUnderlyingReserves).to.equal(initialContractUnderlyingReserves)
      })

      it('should revert if user try to unmint after expiration', async () => {
        await skipToWithdrawWindow(podPut)
        await expect(podPut.connect(seller).unmint(1)).to.be.revertedWith('PodOption: trade window has closed')
      })
    })

    describe('Withdrawing options', () => {
      it('should revert if user try to withdraw before expiration', async () => {
        await expect(podPut.connect(seller).withdraw()).to.be.revertedWith('PodOption: option has not expired yet')
      })

      it('should revert if user try to withdraw without balance after expiration', async () => {
        // Set Expiration
        await skipToWithdrawWindow(podPut)

        await expect(podPut.connect(seller).withdraw()).to.be.revertedWith('PodOption: you do not have balance to withdraw')
      })

      it('should get withdraw amounts correctly in a mixed amount of Strike Asset and Underlying Asset (Ma-Mb-Ec-Wa-Wb)', async () => {
        await MintPhase(scenario.amountToMint)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)

        await skipToExerciseWindow(podPut)
        await ExercisePhase(scenario.amountToMint, seller, another, anotherAddress)

        const funds = await podPut.connect(seller).getSellerWithdrawAmounts(sellerAddress)
        expect(funds.underlyingAmount).to.be.equal(scenario.amountToMint.div(2))
        expect(funds.strikeAmount).to.be.equal(scenario.strikePrice.div(2))
      })

      it('should withdraw Strike Asset balance plus interest earned', async () => {
        await MintPhase(scenario.amountToMint)
        // Earned 10% interest
        await mockStrikeAsset.earnInterest(podPut.address)
        const earnedInterest = scenario.strikePrice.div(ethers.BigNumber.from('100'))
        // Set Expiration
        const initialSellerOptionBalance = await podPut.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialContractStrikeReserves = await podPut.strikeReserves()

        expect(initialSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialSellerStrikeBalance).to.equal(0)
        expect(initialContractStrikeReserves).to.equal(scenario.strikePrice.add(earnedInterest))

        await skipToWithdrawWindow(podPut)
        await podPut.connect(seller).withdraw()

        const finalSellerOptionBalance = await podPut.balanceOf(sellerAddress)
        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractStrikeReserves = await podPut.strikeReserves()

        expect(finalSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(finalSellerStrikeBalance).to.equal(scenario.strikePrice.add(earnedInterest))
        expect(finalContractStrikeReserves).to.equal(0)
        expect(await podPut.mintedOptions(sellerAddress)).to.be.equal(0)
        // Cant withdraw two times in a row
        await expect(podPut.connect(seller).withdraw()).to.be.revertedWith('PodOption: you do not have balance to withdraw')
      })

      it('should withdraw Strike Asset balance plus interest earned proportional (Ma-Mb-Wa-Wb)', async () => {
        // seller 1
        await MintPhase(scenario.amountToMint)

        await mockStrikeAsset.earnInterest(podPut.address)

        // seller 1
        const twoTimesAmountToMint = scenario.amountToMint.mul(2)
        await MintPhase(twoTimesAmountToMint, buyer, buyerAddress)
        const optionDecimals = await podPut.decimals()

        // Earned 10% interest
        await mockStrikeAsset.earnInterest(podPut.address)
        // Set Expiration
        const initialSellerOptionBalance = await podPut.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialContractStrikeReserves = await podPut.strikeReserves()

        expect(initialSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialSellerStrikeBalance).to.equal(0)
        expect(initialContractStrikeReserves).to.gt(scenario.strikePrice.mul(3))

        await skipToWithdrawWindow(podPut)
        await podPut.connect(seller).withdraw()

        expect(await podPut.mintedOptions(sellerAddress)).to.be.equal(0)
        const finalSellerOptionBalance = await podPut.balanceOf(sellerAddress)
        const finalSellerStrikegBalance = await mockStrikeAsset.balanceOf(sellerAddress)

        expect(finalSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(finalSellerStrikegBalance).to.gt(scenario.strikePrice)
        expect(finalSellerStrikegBalance).to.lt(scenario.strikePrice.mul(twoTimesAmountToMint).div(ethers.BigNumber.from(10).pow(optionDecimals)))
        // Cant withdraw two times in a row
        await expect(podPut.connect(seller).withdraw()).to.be.revertedWith('PodOption: you do not have balance to withdraw')

        await podPut.connect(buyer).withdraw()

        const finalBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)
        const finalContractStrikeReserves = await podPut.strikeReserves()

        expect(finalBuyerStrikeBalance).to.gt(scenario.strikePrice.mul(twoTimesAmountToMint).div(ethers.BigNumber.from(10).pow(optionDecimals)))
        expect(finalContractStrikeReserves).to.equal(0)

        await expect(podPut.connect(buyer).withdraw()).to.be.revertedWith('PodOption: you do not have balance to withdraw')
      })

      it('should withdraw mixed amount of Strike Asset and Underlying Asset (Ma-Mb-Ec-Wa-Wb)', async () => {
        // Ma => Mint with user A (seller)
        await MintPhase(scenario.amountToMint)
        await mockStrikeAsset.earnInterest(podPut.address)
        const halfAmountMint = ethers.BigNumber.from(scenario.amountToMint).div(2)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)
        await mockStrikeAsset.earnInterest(podPut.address)

        await skipToExerciseWindow(podPut)
        await ExercisePhase(halfAmountMint, seller, another, anotherAddress)

        const underlyingDecimals = await mockUnderlyingAsset.decimals()
        // Checking balance before withdraw
        const initialSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)

        await skipToWithdrawWindow(podPut)
        await expect(podPut.connect(seller).withdraw())
        await expect(podPut.connect(seller).withdraw()).to.be.revertedWith('PodOption: you do not have balance to withdraw')

        expect(await podPut.mintedOptions(sellerAddress)).to.be.equal(0)
        const finalSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)

        const earnedSellerStrike = finalSellerStrikeBalance.sub(initialSellerStrikeBalance)
        const earnedSellerUnderlying = finalSellerUnderlyingBalance.sub(initialSellerUnderlyingBalance)
        const earnedSellerInUnitsOfStrike = earnedSellerUnderlying.mul(scenario.strikePrice).div(ethers.BigNumber.from(10).pow(underlyingDecimals))
        const totalEarned = earnedSellerStrike.add(earnedSellerInUnitsOfStrike)

        const initialSellerStriked = await podPut.strikeToTransfer(scenario.amountToMint)

        expect(totalEarned).to.gte(initialSellerStriked)

        const initialBuyerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(buyerAddress)
        const initialBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)

        await expect(podPut.connect(buyer).withdraw())
        await expect(podPut.connect(buyer).withdraw()).to.be.revertedWith('PodOption: you do not have balance to withdraw')

        const finalBuyerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(buyerAddress)
        const finalBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)

        const earnedBuyerStrike = finalBuyerStrikeBalance.sub(initialBuyerStrikeBalance)
        const earnedBuyerUnderlying = finalBuyerUnderlyingBalance.sub(initialBuyerUnderlyingBalance)
        const earnedBuyerInUnitsOfStrike = earnedBuyerUnderlying.mul(scenario.strikePrice).div(ethers.BigNumber.from(10).pow(underlyingDecimals))
        const totalEarnedBuyer = earnedBuyerStrike.add(earnedBuyerInUnitsOfStrike)

        const initialBuyerStriked = await podPut.strikeToTransfer(scenario.amountToMint)

        expect(totalEarnedBuyer).to.gte(initialBuyerStriked)
      })
    })

    describe('American Options', () => {
      beforeEach(async function () {
        snapshotId = await takeSnapshot()

        podPutAmerican = await PodPut.deploy(
          scenario.name,
          scenario.name,
          EXERCISE_TYPE_AMERICAN,
          mockUnderlyingAsset.address,
          mockStrikeAsset.address,
          scenario.strikePrice,
          await getTimestamp() + 24 * 60 * 60 * 7,
          0, // 24h
          configurationManager.address
        )
      })

      it('should mint american options correctly', async () => {
        expect(await podPutAmerican.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(podPutAmerican.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        await podPutAmerican.connect(seller).mint(scenario.amountToMint, sellerAddress)
        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)

        const funds = await podPutAmerican.connect(seller).getSellerWithdrawAmounts(sellerAddress)
        expect(funds.underlyingAmount).to.be.equal(0)
        expect(funds.strikeAmount).to.be.gte(scenario.strikePrice)
      })

      it('should unmint american options partially', async () => {
        expect(await podPutAmerican.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(podPutAmerican.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        await mockUnderlyingAsset.connect(seller).approve(podPutAmerican.address, ethers.constants.MaxUint256)
        await mockUnderlyingAsset.connect(seller).mint(scenario.amountToMint.mul(2))

        await podPutAmerican.connect(seller).mint(scenario.amountToMint, sellerAddress)
        await podPutAmerican.connect(seller).exercise(scenario.amountToMint.div(2))

        await podPutAmerican.connect(seller).unmint(scenario.amountToMint.div(2))

        // should receive underlying + strike
      })

      it('should revert if trying to exercise after expiration', async () => {
        await mockStrikeAsset.connect(seller).approve(podPutAmerican.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        await skipToWithdrawWindow(podPutAmerican)
        await expect(podPutAmerican.connect(seller).exercise(scenario.amountToMint)).to.be.revertedWith('PodOption: not in exercise window')
      })

      it('should withdraw american options correctly', async () => {
        expect(await podPutAmerican.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(podPutAmerican.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        await podPutAmerican.connect(seller).mint(scenario.amountToMint, sellerAddress)
        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)

        await skipToWithdrawWindow(podPutAmerican)
        await expect(podPutAmerican.connect(seller).withdraw()).to.not.be.reverted
        await expect(podPutAmerican.connect(seller).exercise(scenario.amountToMint)).to.be.revertedWith('PodOption: not in exercise window')
      })

      it('should revert if trying to withdraw before expiration', async () => {
        await mockStrikeAsset.connect(seller).approve(podPutAmerican.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        await podPutAmerican.connect(seller).mint(scenario.amountToMint, sellerAddress)

        await expect(podPutAmerican.connect(seller).withdraw()).to.be.revertedWith('PodOption: option has not expired yet')
      })

      it('should revert if unmint amount is too low - underlying', async () => {
        if (scenario.underlyingAssetDecimals > scenario.strikeAssetDecimals) return
        await mockStrikeAsset.connect(seller).approve(podPutAmerican.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice.mul(2))

        await mockUnderlyingAsset.connect(seller).approve(podPutAmerican.address, ethers.constants.MaxUint256)
        await mockUnderlyingAsset.connect(seller).mint(scenario.amountToMint.mul(2))

        await podPutAmerican.connect(seller).mint(scenario.amountToMint, sellerAddress)
        const ownerShares = await podPut.shares(sellerAddress)
        const userMintedOptions = await podPut.mintedOptions(sellerAddress)

        await podPutAmerican.connect(seller).exercise('1')

        // if (ownerShares.div(userMintedOptions).gt(1)) return
        await expect(podPutAmerican.connect(seller).unmint('1')).to.be.revertedWith('PodPut: amount of options is too low')
      })
    })
  })
})
