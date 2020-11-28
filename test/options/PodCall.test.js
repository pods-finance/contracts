const { expect } = require('chai')
const getTimestamp = require('../util/getTimestamp')
const forceExpiration = require('../util/forceExpiration')
const forceEndOfExerciseWindow = require('../util/forceEndOfExerciseWindow')
const { takeSnapshot, revertToSnapshot } = require('../util/snapshot')

const EXERCISE_TYPE_EUROPEAN = 0 // European

const scenarios = [
  {
    name: 'WETH/aUSDC',
    underlyingAssetSymbol: 'WETH',
    underlyingAssetDecimals: 18,
    strikeAssetSymbol: 'aUSDC',
    strikeAssetDecimals: 6,
    strikePrice: ethers.BigNumber.from(7000e6.toString()),
    amountToMint: ethers.BigNumber.from(1e18.toString()),
    amountToMintTooLow: 1
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
    amountToMintTooLow: 1
  }
]

scenarios.forEach(scenario => {
  describe('PodCall.sol - ' + scenario.name, () => {
    let mockUnderlyingAsset
    let mockStrikeAsset
    let PodCall
    let podCall
    let seller
    let sellerAddress
    let buyer
    let buyerAddress
    let another
    let anotherAddress
    let snapshot
    let snapshotId

    before(async function () {
      [seller, buyer, another] = await ethers.getSigners()
      sellerAddress = await seller.getAddress()
      buyerAddress = await buyer.getAddress()
      anotherAddress = await another.getAddress()
    })

    beforeEach(async function () {
      snapshot = await takeSnapshot()
      snapshotId = snapshot.result

      const MockInterestBearingERC20 = await ethers.getContractFactory('MintableInterestBearing')
      PodCall = await ethers.getContractFactory('PodCall')

      mockUnderlyingAsset = await MockInterestBearingERC20.deploy(scenario.underlyingAssetSymbol, scenario.underlyingAssetSymbol, scenario.underlyingAssetDecimals)
      mockStrikeAsset = await MockInterestBearingERC20.deploy(scenario.strikeAssetSymbol, scenario.strikeAssetSymbol, scenario.strikeAssetDecimals)

      await mockUnderlyingAsset.deployed()
      await mockStrikeAsset.deployed()

      podCall = await PodCall.deploy(
        scenario.name,
        scenario.name,
        EXERCISE_TYPE_EUROPEAN,
        mockUnderlyingAsset.address,
        mockStrikeAsset.address,
        scenario.strikePrice,
        await getTimestamp() + 24 * 60 * 60 * 7,
        24 * 60 * 60 // 24h
      )

      await podCall.deployed()
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
          24 * 60 * 60 // 24h
        )
        await expect(podCall).to.revertedWith('PodOption/underlying-asset-is-not-a-contract')

        podCall = PodCall.deploy(
          'pod:WBTC:USDC:5000:A',
          'pod:WBTC:USDC:5000:A',
          EXERCISE_TYPE_EUROPEAN,
          mockUnderlyingAsset.address,
          ethers.constants.AddressZero,
          scenario.strikePrice,
          await getTimestamp() + 24 * 60 * 60,
          24 * 60 * 60 // 24h
        )
        await expect(podCall).to.revertedWith('PodOption/strike-asset-is-not-a-contract')
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
          24 * 60 * 60 // 24h
        )
        await expect(podCall).to.revertedWith('PodOption/underlying-asset-is-not-a-contract')
        podCall = PodCall.deploy(
          'pod:WBTC:USDC:5000:A',
          'pod:WBTC:USDC:5000:A',
          EXERCISE_TYPE_EUROPEAN,
          mockUnderlyingAsset.address,
          ethers.constants.AddressZero,
          scenario.strikePrice,
          await getTimestamp() + 24 * 60 * 60,
          24 * 60 * 60 // 24h
        )
        await expect(podCall).to.revertedWith('PodOption/strike-asset-is-not-a-contract')
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
          24 * 60 * 60 // 24h
        )
        await expect(podCall).to.revertedWith('PodOption/underlying-asset-and-strike-asset-must-differ')
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
          24 * 60 * 60 // 24h
        )
        await expect(podCall).to.revertedWith('PodOption/expiration-should-be-in-a-future-timestamp')
      })

      it('should not allow exerciseWindowSize lesser than or equal 0', async () => {
        podCall = PodCall.deploy(
          'pod:WBTC:USDC:5000:A',
          'pod:WBTC:USDC:5000:A',
          EXERCISE_TYPE_EUROPEAN,
          mockUnderlyingAsset.address,
          mockStrikeAsset.address,
          scenario.strikePrice,
          await getTimestamp() + 24 * 60 * 60,
          0
        )
        await expect(podCall).to.revertedWith('PodOption/exercise-window-size-must-be-greater-than-zero')
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
          24 * 60 * 60 // 24h
        )
        await expect(podCall).to.revertedWith('PodOption/strike-price-must-be-greater-than-zero')
      })

      it('should not allow exercise windows shorter than 24 hours', async () => {
        podCall = PodCall.deploy(
          'pod:WBTC:USDC:5000:A',
          'pod:WBTC:USDC:5000:A',
          EXERCISE_TYPE_EUROPEAN,
          mockUnderlyingAsset.address,
          mockStrikeAsset.address,
          scenario.strikePrice,
          await getTimestamp() + 24 * 60 * 60,
          (24 * 60 * 60) - 1 // 24h - 1 second
        )
        await expect(podCall).to.revertedWith('PodOption/exercise-window-must-be-greater-than-or-equal-86400')
      })
    })

    describe('Minting options', () => {
      it('should revert if user dont have enough collateral', async () => {
        expect(await podCall.balanceOf(sellerAddress)).to.equal(0)

        await mockUnderlyingAsset.connect(seller).approve(podCall.address, ethers.constants.MaxUint256)

        expect(await mockUnderlyingAsset.balanceOf(sellerAddress)).to.equal(0)
        await expect(podCall.connect(seller).mint(scenario.amountToMint, sellerAddress)).to.be.revertedWith('ERC20: transfer amount exceeds balance')
      })

      it('should revert if user do not approve collateral to be spent by PodCall', async () => {
        expect(await podCall.balanceOf(sellerAddress)).to.equal(0)

        await mockUnderlyingAsset.connect(seller).mint(scenario.amountToMint)

        expect(await mockUnderlyingAsset.balanceOf(sellerAddress)).to.equal(scenario.amountToMint)

        await expect(podCall.connect(seller).mint(scenario.amountToMint, sellerAddress)).to.be.revertedWith('ERC20: transfer amount exceeds allowance')
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

      it('should revert if user try to mint after expiration - European', async () => {
        expect(await podCall.balanceOf(sellerAddress)).to.equal(0)

        await mockUnderlyingAsset.connect(seller).approve(podCall.address, ethers.constants.MaxUint256)
        await mockUnderlyingAsset.connect(seller).mint(scenario.amountToMint)

        expect(await mockUnderlyingAsset.balanceOf(sellerAddress)).to.equal(scenario.amountToMint)
        await forceExpiration(podCall)
        await expect(podCall.connect(seller).mint(scenario.amountToMint, sellerAddress)).to.be.revertedWith('Option has expired')
      })
    })

    describe('Exercising options', () => {
      it('should revert if user try to exercise before expiration', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await podCall.connect(seller).transfer(buyerAddress, scenario.amountToMint)
        // Mint Underlying Asset
        await mockStrikeAsset.connect(buyer).mint(scenario.strikePrice)
        expect(await mockStrikeAsset.balanceOf(buyerAddress)).to.equal(scenario.strikePrice)
        await expect(podCall.connect(buyer).exercise(scenario.amountToMint)).to.be.revertedWith('Option has not expired yet')
      })
      it('should revert if user have strike approved, but do not have enough options', async () => {
        // Mint underlying
        await mockStrikeAsset.connect(buyer).mint(scenario.strikePrice)
        // Approve PodPut spend underlying asset
        await mockStrikeAsset.connect(buyer).approve(podCall.address, ethers.constants.MaxUint256)
        expect(await mockStrikeAsset.balanceOf(buyerAddress)).to.equal(scenario.strikePrice)
        await forceExpiration(podCall)
        await expect(podCall.connect(buyer).exercise(scenario.amountToMint)).to.be.revertedWith('ERC20: burn amount exceeds balance')
      })

      it('should revert if sender not have enough strike balance', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await podCall.connect(seller).transfer(buyerAddress, scenario.amountToMint)
        // Approve PodPut spend underlying asset
        await mockStrikeAsset.connect(buyer).approve(podCall.address, ethers.constants.MaxUint256)
        await forceExpiration(podCall)
        await expect(podCall.connect(buyer).exercise(scenario.amountToMint)).to.be.revertedWith('ERC20: transfer amount exceeds balance')
      })

      it('should revert if not approved strike balance', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await podCall.connect(seller).transfer(buyerAddress, scenario.amountToMint)

        await mockStrikeAsset.connect(buyer).mint(scenario.strikePrice)
        expect(await mockStrikeAsset.balanceOf(buyerAddress)).to.equal(scenario.strikePrice)
        await forceExpiration(podCall)
        await expect(podCall.connect(buyer).exercise(scenario.amountToMint)).to.be.revertedWith('ERC20: transfer amount exceeds allowance')
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
        const initialContractUnderlyingBalance = await podCall.underlyingBalance()
        const initialContractStrikeBalance = await podCall.strikeBalance()
        const initialContractOptionSupply = await podCall.totalSupply()

        expect(initialBuyerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialBuyerUnderlyingBalance).to.equal(0)
        expect(initialBuyerStrikeBalance).to.equal(scenario.strikePrice)
        expect(initialContractUnderlyingBalance).to.equal(scenario.amountToMint)
        expect(initialContractStrikeBalance).to.equal(0)
        expect(initialContractOptionSupply).to.equal(scenario.amountToMint)

        await forceExpiration(podCall)
        await expect(podCall.connect(buyer).exercise(scenario.amountToMint)).to.not.be.reverted

        const finalBuyerOptionBalance = await podCall.balanceOf(buyerAddress)
        const finalBuyerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(buyerAddress)
        const finalBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)
        const finalContractUnderlyingBalance = await podCall.underlyingBalance()
        const finalContractStrikeBalance = await podCall.strikeBalance()
        const finalContractOptionSupply = await podCall.totalSupply()

        expect(finalBuyerOptionBalance).to.equal(0)
        expect(finalBuyerUnderlyingBalance).to.equal(scenario.amountToMint)
        expect(finalBuyerStrikeBalance).to.equal(0)
        expect(finalContractUnderlyingBalance).to.equal(0)
        expect(finalContractStrikeBalance).to.equal(scenario.strikePrice)
        expect(finalContractOptionSupply).to.equal(0)
      })
      it('should revert if user try to exercise after exercise window - European', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await podCall.connect(seller).transfer(buyerAddress, scenario.amountToMint)
        // Mint Underlying Asset
        await mockStrikeAsset.connect(buyer).mint(scenario.strikePrice)
        expect(await mockStrikeAsset.balanceOf(buyerAddress)).to.equal(scenario.strikePrice)
        await forceEndOfExerciseWindow(podCall)
        await expect(podCall.connect(seller).exercise(scenario.amountToMint)).to.be.reverted
      })
    })

    describe('unminting options', () => {
      it('should revert if try to unmint without amount', async () => {
        await expect(podCall.connect(seller).unmint(scenario.amountToMint)).to.be.revertedWith('You do not have minted options')
      })
      it('should revert if try to unmint amount higher than possible', async () => {
        await MintPhase(scenario.amountToMint)
        await expect(podCall.connect(seller).unmint(2 * scenario.amountToMint)).to.be.revertedWith('Exceed address minted options')
      })
      it('should unmint, destroy sender option, reduce his balance and send underlying back', async () => {
        await MintPhase(scenario.amountToMint)
        const initialSellerOptionBalance = await podCall.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
        const initialContractUnderlyingBalance = await podCall.underlyingBalance()
        const initialContractStrikeBalance = await podCall.strikeBalance()
        const initialContractOptionSupply = await podCall.totalSupply()

        expect(initialSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialSellerStrikeBalance).to.equal(0)
        expect(initialSellerUnderlyingBalance).to.equal(0)
        expect(initialContractStrikeBalance).to.equal(0)
        expect(initialContractUnderlyingBalance).to.equal(scenario.amountToMint)
        expect(initialContractOptionSupply).to.equal(scenario.amountToMint)
        await expect(podCall.connect(seller).unmint(scenario.amountToMint)).to.not.be.reverted

        const finalSellerOptionBalance = await podCall.balanceOf(sellerAddress)
        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
        const finalContractUnderlyingBalance = await podCall.underlyingBalance()
        const finalContractStrikeBalance = await podCall.strikeBalance()
        const finalContractOptionSupply = await podCall.totalSupply()

        expect(finalSellerOptionBalance).to.equal(0)
        expect(finalSellerStrikeBalance).to.equal(0)
        expect(finalSellerUnderlyingBalance).to.equal(scenario.amountToMint)
        expect(finalContractStrikeBalance).to.equal(0)
        expect(finalContractOptionSupply).to.equal(0)
        expect(finalContractUnderlyingBalance).to.equal(0)
      })
      it('should unmint, destroy seller option, reduce his balance and send underlying back counting interests (Ma-Mb-UNa)', async () => {
        await MintPhase(scenario.amountToMint)
        await mockUnderlyingAsset.earnInterest(podCall.address)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)
        await mockUnderlyingAsset.earnInterest(podCall.address)

        const initialContractStrikeBalance = await podCall.strikeBalance()
        const initialContractOptionSupply = await podCall.totalSupply()

        await expect(podCall.connect(seller).unmint(scenario.amountToMint)).to.not.be.reverted

        const finalSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
        const finalContractUnderlyingBalance = await podCall.underlyingBalance()
        const finalContractStrikeBalance = await podCall.strikeBalance()
        const finalContractOptionSupply = await podCall.totalSupply()

        expect(finalSellerUnderlyingBalance).to.gte(scenario.amountToMint)
        expect(finalContractOptionSupply).to.equal(initialContractOptionSupply.sub(scenario.amountToMint))
        expect(finalContractStrikeBalance).to.equal(initialContractStrikeBalance)
        expect(finalContractUnderlyingBalance).to.gte(scenario.amountToMint)
      })
      it('should unmint, destroy seller option, reduce his balance and send underlying back counting interests (Ma-Mb-UNa-UNb)', async () => {
        await MintPhase(scenario.amountToMint)
        await mockUnderlyingAsset.earnInterest(podCall.address)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)
        await mockUnderlyingAsset.earnInterest(podCall.address)

        await expect(podCall.connect(seller).unmint(scenario.amountToMint)).to.not.be.reverted

        await expect(podCall.connect(buyer).unmint(scenario.amountToMint)).to.not.be.reverted

        const finalBuyerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(buyerAddress)
        const finalSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
        const finalContractStrikeBalance = await podCall.strikeBalance()
        const finalContractOptionSupply = await podCall.totalSupply()
        const finalContractUnderlyingBalance = await podCall.underlyingBalance()

        expect(finalBuyerUnderlyingBalance).to.gte(scenario.amountToMint)
        expect(finalSellerUnderlyingBalance).to.gte(scenario.amountToMint) // earned interests
        expect(finalContractStrikeBalance).to.equal(0)
        expect(finalContractOptionSupply).to.equal(0)
        expect(finalContractUnderlyingBalance).to.equal(0)
      })
      it('should revert if user try to unmint after expiration - European', async () => {
        await forceExpiration(podCall)
        await expect(podCall.connect(seller).unmint()).to.be.revertedWith('Option has not expired yet')
      })
    })

    describe('Withdrawing options', () => {
      it('should revert if user try to withdraw before expiration', async () => {
        await expect(podCall.connect(seller).withdraw()).to.be.revertedWith('Window of exercise has not ended yet')
      })

      it('should revert if user try to withdraw without balance after expiration', async () => {
        await forceEndOfExerciseWindow(podCall)

        await expect(podCall.connect(seller).withdraw()).to.be.revertedWith('You do not have balance to withdraw')
      })

      it('should withdraw Underlying Asset balance plus interest earned', async () => {
        await MintPhase(scenario.amountToMint)
        // Earned 10% interest
        await mockUnderlyingAsset.earnInterest(podCall.address)

        await forceEndOfExerciseWindow(podCall)
        await podCall.connect(seller).withdraw()

        const finalSellerOptionBalance = await podCall.balanceOf(sellerAddress)
        const finalSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
        const finalContractStrikeBalance = await podCall.strikeBalance()
        const finalContractUnderlyingBalance = await podCall.underlyingBalance()

        expect(finalSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(finalSellerUnderlyingBalance).to.gte(scenario.amountToMint)
        expect(finalContractStrikeBalance).to.equal(0)
        expect(finalContractUnderlyingBalance).to.equal(0)
        // Cant withdraw two times in a row
        await expect(podCall.connect(seller).withdraw()).to.be.revertedWith('You do not have balance to withdraw')
      })

      it('should withdraw Underlying Asset balance plus interest earned proportional (Ma-Mb-Wa-Wb)', async () => {
        await MintPhase(scenario.amountToMint)
        await mockUnderlyingAsset.earnInterest(podCall.address)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)
        await mockUnderlyingAsset.earnInterest(podCall.address)

        await forceEndOfExerciseWindow(podCall)
        await podCall.connect(seller).withdraw()
        await podCall.connect(buyer).withdraw()

        const finalBuyerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(buyerAddress)
        const finalSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
        const finalContractStrikeBalance = await podCall.strikeBalance()
        const finalContractUnderlyingBalance = await podCall.underlyingBalance()

        expect(finalBuyerUnderlyingBalance).to.gte(scenario.amountToMint)
        expect(finalSellerUnderlyingBalance).to.gte(scenario.amountToMint) // earned interests
        expect(finalContractStrikeBalance).to.equal(0)
        expect(finalContractUnderlyingBalance).to.equal(0)
      })

      it('should withdraw mixed amount of Strike Asset and Underlying Asset (Ma-Mb-Ec-Wa-Wb)', async () => {
        // Ma => Mint with user A (seller)
        await MintPhase(scenario.amountToMint)
        await mockUnderlyingAsset.earnInterest(podCall.address)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)
        await mockUnderlyingAsset.earnInterest(podCall.address)

        const halfAmountMint = ethers.BigNumber.from(scenario.amountToMint).div(2)
        await forceExpiration(podCall)
        await ExercisePhase(halfAmountMint, seller, another, anotherAddress)

        await forceEndOfExerciseWindow(podCall)
        await expect(podCall.connect(seller).withdraw()).to.not.be.reverted
        await expect(podCall.connect(buyer).withdraw()).to.not.be.reverted

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
  })
})