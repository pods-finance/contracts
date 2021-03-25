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
    name: 'WETH/aUSDC',
    underlyingAssetSymbol: 'WETH',
    underlyingAssetDecimals: 18,
    strikeAssetSymbol: 'aUSDC',
    strikeAssetDecimals: 6,
    strikePrice: ethers.BigNumber.from(7000e6.toString()),
    amountToMint: ethers.BigNumber.from(1e18.toString()),
    amountToMintTooLow: 1,
    cap: ethers.BigNumber.from(20e18.toString())
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
  describe('PodCall.sol - ' + scenario.name, () => {
    let mockUnderlyingAsset
    let mockStrikeAsset
    let configurationManager
    let PodCall
    let podCall
    let seller
    let sellerAddress
    let buyer
    let buyerAddress
    let another
    let anotherAddress
    let snapshotId
    let podCallAmerican

    before(async function () {
      [seller, buyer, another] = await ethers.getSigners()
      sellerAddress = await seller.getAddress()
      buyerAddress = await buyer.getAddress()
      anotherAddress = await another.getAddress()

      ;[MockInterestBearingERC20, PodCall] = await Promise.all([
        ethers.getContractFactory('MintableInterestBearing'),
        ethers.getContractFactory('PodCall')
      ])

      mockUnderlyingAsset = await MockInterestBearingERC20.deploy(scenario.underlyingAssetSymbol, scenario.underlyingAssetSymbol, scenario.underlyingAssetDecimals)
      mockStrikeAsset = await MockInterestBearingERC20.deploy(scenario.strikeAssetSymbol, scenario.strikeAssetSymbol, scenario.strikeAssetDecimals)

      configurationManager = await createConfigurationManager()
    })

    beforeEach(async function () {
      snapshotId = await takeSnapshot()

      podCall = await PodCall.deploy(
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

      await mockUnderlyingAsset.connect(signer).approve(podCall.address, ethers.constants.MaxUint256)
      await mockUnderlyingAsset.connect(signer).mint(amountOfOptionsToMint)

      expect(await mockUnderlyingAsset.balanceOf(signerAddress)).to.equal(amountOfOptionsToMint)
      await podCall.connect(signer).mint(amountOfOptionsToMint, owner)
    }

    async function ExercisePhase (amountOfOptionsToExercise, signer = seller, receiver = buyer, receiverAddress = buyerAddress) {
      await podCall.connect(signer).transfer(receiverAddress, amountOfOptionsToExercise)
      await mockStrikeAsset.connect(receiver).mint(scenario.strikePrice.mul(amountOfOptionsToExercise))
      await mockStrikeAsset.connect(receiver).approve(podCall.address, ethers.constants.MaxUint256)
      await podCall.connect(receiver).exercise(amountOfOptionsToExercise)
    }

    describe('Constructor/Initialization checks', () => {
      it('should have correct number of decimals for underlying and strike asset', async () => {
        expect(await podCall.strikeAssetDecimals()).to.equal(scenario.strikeAssetDecimals)
        expect(await podCall.underlyingAssetDecimals()).to.equal(scenario.underlyingAssetDecimals)
      })

      it('should have correct exercise type', async () => {
        expect(await podCall.exerciseType()).to.equal(EXERCISE_TYPE_EUROPEAN)
      })

      it('should have equal number of decimals podPut and underlyingAsset', async () => {
        expect(await podCall.decimals()).to.equal(scenario.underlyingAssetDecimals)
      })

      it('should have equal number of decimals StrikePrice and strikeAsset', async () => {
        expect(await podCall.strikePriceDecimals()).to.equal(await podCall.strikeAssetDecimals())
      })

      it('should not allow underlyingAsset/strikeAsset with 0x0 address', async () => {
        podCall = PodCall.deploy(
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
        await expect(podCall).to.revertedWith('PodOption: underlying asset is not a contract')

        podCall = PodCall.deploy(
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
        await expect(podCall).to.revertedWith('PodOption: strike asset is not a contract')
      })

      it('should not allow underlyingAsset/strikeAsset that are not contracts', async () => {
        podCall = PodCall.deploy(
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
        await expect(podCall).to.revertedWith('PodOption: underlying asset is not a contract')
        podCall = PodCall.deploy(
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
        await expect(podCall).to.revertedWith('PodOption: strike asset is not a contract')
      })

      it('should not allow for underlyingAsset and strikeAsset too be the same address', async () => {
        podCall = PodCall.deploy(
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
        await expect(podCall).to.revertedWith('PodOption: underlying asset and strike asset must differ')
      })

      it('should only allow expiration in the future', async () => {
        podCall = PodCall.deploy(
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
        await expect(podCall).to.revertedWith('PodOption: expiration should be in the future')
      })

      it('should not allow strikePrice lesser than or equal 0', async () => {
        podCall = PodCall.deploy(
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
        await expect(podCall).to.revertedWith('PodOption: strike price must be greater than zero')
      })

      it('should not allow exercise windows shorter than 24 hours if EUROPEAN exercise type', async () => {
        podCall = PodCall.deploy(
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
        await expect(podCall).to.revertedWith('PodOption: exercise window must be greater than or equal 86400')
      })

      it('should not allow exercise windows equal to 0 if AMERICAN exercise type', async () => {
        podCall = PodCall.deploy(
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
        await expect(podCall).to.revertedWith('PodOption: exercise window size must be equal to zero')
      })
    })

    describe('Minting options', () => {
      it('should revert if user dont have enough collateral', async () => {
        expect(await podCall.balanceOf(sellerAddress)).to.equal(0)

        await mockUnderlyingAsset.connect(seller).approve(podCall.address, ethers.constants.MaxUint256)

        expect(await mockUnderlyingAsset.balanceOf(sellerAddress)).to.equal(0)
        await expect(
          podCall.connect(seller).mint(scenario.amountToMint, sellerAddress)
        ).to.be.reverted
      })

      it('should revert if user tries to mint 0 options', async () => {
        expect(await podCall.balanceOf(sellerAddress)).to.equal(0)

        await mockUnderlyingAsset.connect(seller).mint(scenario.amountToMint)

        expect(await mockUnderlyingAsset.balanceOf(sellerAddress)).to.equal(scenario.amountToMint)

        await expect(podCall.connect(seller).mint(0, sellerAddress)).to.be.revertedWith('PodCall: you can not mint zero options')
      })

      it('should mint, and have right number when checking for users balances', async () => {
        expect(await podCall.balanceOf(sellerAddress)).to.equal(0)

        await mockUnderlyingAsset.connect(seller).approve(podCall.address, ethers.constants.MaxUint256)
        await mockUnderlyingAsset.connect(seller).mint(scenario.amountToMint)

        await podCall.connect(seller).mint(scenario.amountToMint, sellerAddress)
        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)

        const funds = await podCall.connect(seller).getSellerWithdrawAmounts(sellerAddress)
        expect(funds.underlyingAmount).to.be.equal(scenario.amountToMint)
        expect(funds.strikeAmount).to.be.equal(0)
      })

      it('should mint, increase senders option balance and decrease sender underlying balance', async () => {
        expect(await podCall.balanceOf(sellerAddress)).to.equal(0)

        await mockUnderlyingAsset.connect(seller).approve(podCall.address, ethers.constants.MaxUint256)
        await mockUnderlyingAsset.connect(seller).mint(scenario.amountToMint)

        expect(await mockUnderlyingAsset.balanceOf(sellerAddress)).to.equal(scenario.amountToMint)
        await podCall.connect(seller).mint(scenario.amountToMint, sellerAddress)
        expect(await podCall.balanceOf(sellerAddress)).to.equal(scenario.amountToMint)
        expect(await mockUnderlyingAsset.balanceOf(sellerAddress)).to.equal(0)
      })

      it('should not be able to mint more than the cap', async () => {
        const capProvider = await ethers.getContractAt('CapProvider', configurationManager.getCapProvider())
        capProvider.setCap(podCall.address, scenario.cap)

        expect(await podCall.balanceOf(sellerAddress)).to.equal(0)

        const capSize = await podCall.capSize()
        const capExceeded = capSize.add(1)

        await mockStrikeAsset.connect(seller).approve(podCall.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(await podCall.strikeToTransfer(capExceeded))

        await expect(podCall.connect(seller).mint(capExceeded, sellerAddress))
          .to.be.revertedWith('CappedOption: amount exceed cap')
      })

      it('should revert if user try to mint after expiration - European', async () => {
        expect(await podCall.balanceOf(sellerAddress)).to.equal(0)

        await mockUnderlyingAsset.connect(seller).approve(podCall.address, ethers.constants.MaxUint256)
        await mockUnderlyingAsset.connect(seller).mint(scenario.amountToMint)

        expect(await mockUnderlyingAsset.balanceOf(sellerAddress)).to.equal(scenario.amountToMint)
        await skipToWithdrawWindow(podCall)
        await expect(podCall.connect(seller).mint(scenario.amountToMint, sellerAddress)).to.be.revertedWith('PodOption: trade window has closed')
      })

      it('should not mint for the zero address behalf', async () => {
        await mockUnderlyingAsset.connect(seller).mint(scenario.strikePrice)
        await mockUnderlyingAsset.connect(seller).approve(podCall.address, scenario.strikePrice)

        const tx = podCall.connect(seller).mint(scenario.amountToMint, ethers.constants.AddressZero)
        await expect(tx).to.be.revertedWith('PodOption: zero address cannot be the owner')
      })
    })

    describe('Exercising options', () => {
      it('should revert if amount of options asked is zero', async () => {
        await skipToExerciseWindow(podCall)
        await expect(podCall.connect(seller).exercise(ethers.BigNumber.from(0)))
          .to.be.revertedWith('PodCall: you can not exercise zero options')
      })

      it('should revert if user try to exercise before expiration', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await podCall.connect(seller).transfer(buyerAddress, scenario.amountToMint)
        // Mint Underlying Asset
        await mockStrikeAsset.connect(buyer).mint(scenario.strikePrice)
        expect(await mockStrikeAsset.balanceOf(buyerAddress)).to.equal(scenario.strikePrice)
        await expect(
          podCall.connect(buyer).exercise(scenario.amountToMint)
        ).to.be.revertedWith('PodOption: not in exercise window')
      })

      it('should revert do not have enough options to exercise', async () => {
        // Mint underlying
        await mockStrikeAsset.connect(buyer).mint(scenario.strikePrice)
        // Approve PodPut spend underlying asset
        await mockStrikeAsset.connect(buyer).approve(podCall.address, ethers.constants.MaxUint256)
        expect(await mockStrikeAsset.balanceOf(buyerAddress)).to.equal(scenario.strikePrice)
        await skipToExerciseWindow(podCall)

        await expect(
          podCall.connect(buyer).exercise(scenario.amountToMint)
        ).to.be.reverted
      })

      it('should revert if sender not have enough strike balance', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await podCall.connect(seller).transfer(buyerAddress, scenario.amountToMint)
        // Approve PodPut spend underlying asset
        await mockStrikeAsset.connect(buyer).approve(podCall.address, ethers.constants.MaxUint256)
        await skipToExerciseWindow(podCall)
        await expect(
          podCall.connect(buyer).exercise(scenario.amountToMint)
        ).to.be.reverted
      })

      it('should exercise and have all final balances matched', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await podCall.connect(seller).transfer(buyerAddress, scenario.amountToMint)

        // Mint Underlying Asset
        await mockStrikeAsset.connect(buyer).mint(scenario.strikePrice)
        // Approve Underlying to be spent by contract
        await mockStrikeAsset.connect(buyer).approve(podCall.address, ethers.constants.MaxUint256)

        const initialBuyerOptionBalance = await podCall.balanceOf(buyerAddress)
        const initialBuyerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(buyerAddress)
        const initialBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)
        const initialContractUnderlyingReserves = await podCall.underlyingReserves()
        const initialContractStrikeReserves = await podCall.strikeReserves()
        const initialContractOptionSupply = await podCall.totalSupply()

        expect(initialBuyerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialBuyerUnderlyingBalance).to.equal(0)
        expect(initialBuyerStrikeBalance).to.equal(scenario.strikePrice)
        expect(initialContractUnderlyingReserves).to.equal(scenario.amountToMint)
        expect(initialContractStrikeReserves).to.equal(0)
        expect(initialContractOptionSupply).to.equal(scenario.amountToMint)

        await skipToExerciseWindow(podCall)
        await expect(podCall.connect(buyer).exercise(scenario.amountToMint)).to.not.be.reverted

        const finalBuyerOptionBalance = await podCall.balanceOf(buyerAddress)
        const finalBuyerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(buyerAddress)
        const finalBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)
        const finalContractUnderlyingReserves = await podCall.underlyingReserves()
        const finalContractStrikeReserves = await podCall.strikeReserves()
        const finalContractOptionSupply = await podCall.totalSupply()

        expect(finalBuyerOptionBalance).to.equal(0)
        expect(finalBuyerUnderlyingBalance).to.equal(scenario.amountToMint)
        expect(finalBuyerStrikeBalance).to.equal(0)
        expect(finalContractUnderlyingReserves).to.equal(0)
        expect(finalContractStrikeReserves).to.equal(scenario.strikePrice)
        expect(finalContractOptionSupply).to.equal(0)
      })

      it('should revert if user try to exercise after exercise window - European', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await podCall.connect(seller).transfer(buyerAddress, scenario.amountToMint)
        // Mint Underlying Asset
        await mockStrikeAsset.connect(buyer).mint(scenario.strikePrice)
        expect(await mockStrikeAsset.balanceOf(buyerAddress)).to.equal(scenario.strikePrice)
        await skipToWithdrawWindow(podCall)
        await expect(podCall.connect(seller).exercise(scenario.amountToMint)).to.be.reverted
      })
    })

    describe('Unminting options', () => {
      it('should revert if try to unmint without amount', async () => {
        await expect(podCall.connect(seller).unmint(scenario.amountToMint)).to.be.revertedWith('PodOption: you do not have minted options')
      })

      it('should revert if try to unmint amount higher than possible', async () => {
        await MintPhase(scenario.amountToMint)
        await expect(podCall.connect(seller).unmint(scenario.amountToMint.mul(2))).to.be.revertedWith('PodOption: not enough minted options')
      })

      it('should unmint, destroy sender option, reduce its balance and send underlying back', async () => {
        await MintPhase(scenario.amountToMint)
        const initialSellerOptionBalance = await podCall.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
        const initialContractUnderlyingReserves = await podCall.underlyingReserves()
        const initialContractStrikeReserves = await podCall.strikeReserves()
        const initialContractOptionSupply = await podCall.totalSupply()

        expect(initialSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialSellerStrikeBalance).to.equal(0)
        expect(initialSellerUnderlyingBalance).to.equal(0)
        expect(initialContractStrikeReserves).to.equal(0)
        expect(initialContractUnderlyingReserves).to.equal(scenario.amountToMint)
        expect(initialContractOptionSupply).to.equal(scenario.amountToMint)
        await expect(podCall.connect(seller).unmint(scenario.amountToMint)).to.not.be.reverted

        const finalSellerOptionBalance = await podCall.balanceOf(sellerAddress)
        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
        const finalContractUnderlyingReserves = await podCall.underlyingReserves()
        const finalContractStrikeReserves = await podCall.strikeReserves()
        const finalContractOptionSupply = await podCall.totalSupply()

        expect(finalSellerOptionBalance).to.equal(0)
        expect(finalSellerStrikeBalance).to.equal(0)
        expect(finalSellerUnderlyingBalance).to.equal(scenario.amountToMint)
        expect(finalContractStrikeReserves).to.equal(0)
        expect(finalContractOptionSupply).to.equal(0)
        expect(finalContractUnderlyingReserves).to.equal(0)
      })

      it('should unmint, destroy seller option, reduce its balance and send underlying back counting interests (Ma-Mb-UNa)', async () => {
        await MintPhase(scenario.amountToMint)
        await mockUnderlyingAsset.earnInterest(podCall.address)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)
        await mockUnderlyingAsset.earnInterest(podCall.address)

        const initialContractStrikeReserves = await podCall.strikeReserves()
        const initialContractOptionSupply = await podCall.totalSupply()

        await expect(podCall.connect(seller).unmint(scenario.amountToMint)).to.not.be.reverted

        const finalSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
        const finalContractUnderlyingReserves = await podCall.underlyingReserves()
        const finalContractStrikeReserves = await podCall.strikeReserves()
        const finalContractOptionSupply = await podCall.totalSupply()

        expect(finalSellerUnderlyingBalance).to.gte(scenario.amountToMint)
        expect(finalContractOptionSupply).to.equal(initialContractOptionSupply.sub(scenario.amountToMint))
        expect(finalContractStrikeReserves).to.equal(initialContractStrikeReserves)
        expect(finalContractUnderlyingReserves).to.gte(scenario.amountToMint)
      })

      it('should unmint, destroy seller option, reduce its balance and send underlying back counting interests (Ma-Mb-UNa-UNb)', async () => {
        await MintPhase(scenario.amountToMint)
        await mockUnderlyingAsset.earnInterest(podCall.address)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)
        await mockUnderlyingAsset.earnInterest(podCall.address)

        await expect(podCall.connect(seller).unmint(scenario.amountToMint)).to.not.be.reverted

        await expect(podCall.connect(buyer).unmint(scenario.amountToMint)).to.not.be.reverted

        const finalBuyerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(buyerAddress)
        const finalSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
        const finalContractStrikeReserves = await podCall.strikeReserves()
        const finalContractOptionSupply = await podCall.totalSupply()
        const finalContractUnderlyingReserves = await podCall.underlyingReserves()

        expect(finalBuyerUnderlyingBalance).to.gte(scenario.amountToMint)
        expect(finalSellerUnderlyingBalance).to.gte(scenario.amountToMint) // earned interests
        expect(finalContractStrikeReserves).to.equal(0)
        expect(finalContractOptionSupply).to.equal(0)
        expect(finalContractUnderlyingReserves).to.equal(0)
      })

      it('should revert if user try to unmint after expiration - European', async () => {
        await skipToWithdrawWindow(podCall)
        await expect(podCall.connect(seller).unmint(1)).to.be.revertedWith('PodOption: trade window has closed')
      })

      it('should revert if user try to unmint after start of exercise window - European', async () => {
        await skipToExerciseWindow(podCall)
        await expect(podCall.connect(seller).unmint(1)).to.be.revertedWith('PodOption: trade window has closed')
      })
    })

    describe('Withdrawing options', () => {
      it('should revert if user try to withdraw before expiration', async () => {
        await expect(podCall.connect(seller).withdraw()).to.be.revertedWith('PodOption: option has not expired yet')
      })

      it('should revert if user try to withdraw without balance after expiration', async () => {
        await skipToWithdrawWindow(podCall)

        await expect(podCall.connect(seller).withdraw()).to.be.revertedWith('PodOption: you do not have balance to withdraw')
      })

      it('should get withdraw amounts correctly in a mixed amount of Strike Asset and Underlying Asset', async () => {
        await MintPhase(scenario.amountToMint)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)

        await skipToExerciseWindow(podCall)
        await ExercisePhase(scenario.amountToMint, seller, another, anotherAddress)

        const funds = await podCall.connect(seller).getSellerWithdrawAmounts(sellerAddress)
        expect(funds.underlyingAmount).to.be.equal(scenario.amountToMint.div(2))
        expect(funds.strikeAmount).to.be.equal(scenario.strikePrice.div(2))
      })

      it('should withdraw Underlying Asset balance plus interest earned', async () => {
        await MintPhase(scenario.amountToMint)
        // Earned 10% interest
        await mockUnderlyingAsset.earnInterest(podCall.address)

        await skipToWithdrawWindow(podCall)
        await podCall.connect(seller).withdraw()

        const finalSellerOptionBalance = await podCall.balanceOf(sellerAddress)
        const finalSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
        const finalContractStrikeReserves = await podCall.strikeReserves()
        const finalContractUnderlyingReserves = await podCall.underlyingReserves()

        expect(finalSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(finalSellerUnderlyingBalance).to.gte(scenario.amountToMint)
        expect(finalContractStrikeReserves).to.equal(0)
        expect(finalContractUnderlyingReserves).to.equal(0)
        expect(await podCall.mintedOptions(sellerAddress)).to.be.equal(0)
        // Cant withdraw two times in a row
        await expect(podCall.connect(seller).withdraw()).to.be.revertedWith('PodOption: you do not have balance to withdraw')
      })

      it('should withdraw Underlying Asset balance plus interest earned proportional (Ma-Mb-Wa-Wb)', async () => {
        await MintPhase(scenario.amountToMint)
        await mockUnderlyingAsset.earnInterest(podCall.address)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)
        await mockUnderlyingAsset.earnInterest(podCall.address)

        await skipToWithdrawWindow(podCall)
        await podCall.connect(seller).withdraw()
        await podCall.connect(buyer).withdraw()

        const finalBuyerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(buyerAddress)
        const finalSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
        const finalContractStrikeReserves = await podCall.strikeReserves()
        const finalContractUnderlyingReserves = await podCall.underlyingReserves()

        expect(finalBuyerUnderlyingBalance).to.gte(scenario.amountToMint)
        expect(finalSellerUnderlyingBalance).to.gte(scenario.amountToMint) // earned interests
        expect(finalContractStrikeReserves).to.equal(0)
        expect(finalContractUnderlyingReserves).to.equal(0)
        expect(await podCall.mintedOptions(sellerAddress)).to.be.equal(0)
      })

      it('should withdraw mixed amount of Strike Asset and Underlying Asset (Ma-Mb-Ec-Wa-Wb)', async () => {
        // Ma => Mint with user A (seller)
        await MintPhase(scenario.amountToMint)
        await mockUnderlyingAsset.earnInterest(podCall.address)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)
        await mockUnderlyingAsset.earnInterest(podCall.address)

        const halfAmountMint = ethers.BigNumber.from(scenario.amountToMint).div(2)
        await skipToExerciseWindow(podCall)
        await ExercisePhase(halfAmountMint, seller, another, anotherAddress)

        await skipToWithdrawWindow(podCall)
        await expect(podCall.connect(seller).withdraw()).to.not.be.reverted
        await expect(podCall.connect(buyer).withdraw()).to.not.be.reverted

        expect(await podCall.mintedOptions(sellerAddress)).to.be.equal(0)
        const finalSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)

        const finalBuyerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(buyerAddress)
        const finalBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)

        const earnedSellerInUnitsOfUnderlying = finalSellerStrikeBalance.mul(ethers.BigNumber.from(10).pow(await mockUnderlyingAsset.decimals())).div(scenario.strikePrice)
        const totalEarnedSeller = finalSellerUnderlyingBalance.add(earnedSellerInUnitsOfUnderlying)

        const earnedBuyerInUnitsOfUnderlying = finalBuyerStrikeBalance.mul(ethers.BigNumber.from(10).pow(await mockUnderlyingAsset.decimals())).div(scenario.strikePrice)
        const totalEarnedBuyer = finalBuyerUnderlyingBalance.add(earnedBuyerInUnitsOfUnderlying)

        expect(totalEarnedSeller).to.gte(scenario.amountToMint)
        expect(totalEarnedBuyer).to.gte(scenario.amountToMint)
      })
    })

    describe('American Options', () => {
      beforeEach(async function () {
        snapshotId = await takeSnapshot()

        podCallAmerican = await PodCall.deploy(
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

      it('should unmint american options partially', async () => {
        expect(await podCallAmerican.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(podCallAmerican.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        await mockUnderlyingAsset.connect(seller).approve(podCallAmerican.address, ethers.constants.MaxUint256)
        await mockUnderlyingAsset.connect(seller).mint(scenario.amountToMint.mul(2))

        await podCallAmerican.connect(seller).mint(scenario.amountToMint, sellerAddress)
        await podCallAmerican.connect(seller).exercise(scenario.amountToMint.div(2))

        await podCallAmerican.connect(seller).unmint(scenario.amountToMint.div(2))

        // should receive underlying + strike
      })

      it('Unmint - should revert if underlyingToSend is 0 (option amount too low)', async () => {
        expect(await podCallAmerican.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(podCallAmerican.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(ethers.constants.MaxUint256)

        await mockUnderlyingAsset.connect(seller).approve(podCallAmerican.address, ethers.constants.MaxUint256)
        await mockUnderlyingAsset.connect(seller).mint(scenario.amountToMint)

        await podCallAmerican.connect(seller).mint(scenario.amountToMint, sellerAddress)
        await podCallAmerican.connect(seller).exercise(scenario.amountToMint.div(2))

        await expect(podCallAmerican.connect(seller).unmint('1')).to.be.revertedWith('PodCall: amount of options is too low')
      })

      it('Unmint - should revert if strikeToSend is 0 (option amount too low)', async () => {
        if (scenario.strikeAssetDecimals >= scenario.underlyingAssetDecimals) return
        expect(await podCallAmerican.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(podCallAmerican.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(ethers.constants.MaxUint256)

        await mockUnderlyingAsset.connect(seller).approve(podCallAmerican.address, ethers.constants.MaxUint256)
        await mockUnderlyingAsset.connect(seller).mint(scenario.amountToMint)

        await podCallAmerican.connect(seller).mint(scenario.amountToMint, sellerAddress)
        await podCallAmerican.connect(seller).exercise(scenario.amountToMint.div(2))

        await expect(podCallAmerican.connect(seller).unmint('3')).to.be.revertedWith('PodCall: amount of options is too low')
      })
    })
  })
})
