const { expect } = require('chai')
const getTxCost = require('../util/getTxCost')
const forceExpiration = require('../util/forceExpiration')
const forceEndOfExerciseWindow = require('../util/forceEndOfExerciseWindow')
const getTimestamp = require('../util/getTimestamp')

const EXERCISE_TYPE_EUROPEAN = 0 // European

const scenarios = [
  {
    name: 'ETH/USDC',
    underlyingAssetSymbol: 'WETH',
    underlyingAssetDecimals: 18,
    strikeAssetSymbol: 'aUSDC',
    strikeAssetDecimals: 6,
    strikePrice: ethers.BigNumber.from(300e6.toString()),
    strikePriceDecimals: 6,
    amountToMint: ethers.BigNumber.from(1e18.toString()),
    amountToMintTooLow: 1
  },
  {
    name: 'ETH/DAI',
    underlyingAssetSymbol: 'WETH',
    underlyingAssetDecimals: 18,
    strikeAssetSymbol: 'aDAI',
    strikeAssetDecimals: 18,
    strikePrice: ethers.BigNumber.from(300e18.toString()),
    strikePriceDecimals: 18,
    amountToMint: ethers.BigNumber.from(1e18.toString()),
    amountToMintTooLow: 1
  }
]
scenarios.forEach(scenario => {
  describe('WPodCall.sol - ' + scenario.name, () => {
    let mockUnderlyingAsset
    let mockStrikeAsset
    let wPodCall
    let seller
    let sellerAddress
    let buyer
    let buyerAddress
    let another
    let anotherAddress

    before(async function () {
      [seller, buyer, another] = await ethers.getSigners()
      sellerAddress = await seller.getAddress()
      buyerAddress = await buyer.getAddress()
      anotherAddress = await another.getAddress()
    })

    beforeEach(async function () {
      const MockInterestBearingERC20 = await ethers.getContractFactory('MintableInterestBearing')
      const MockWETH = await ethers.getContractFactory('WETH')
      const PodCall = await ethers.getContractFactory('WPodCall')

      mockUnderlyingAsset = await MockWETH.deploy()
      mockStrikeAsset = await MockInterestBearingERC20.deploy(scenario.strikeAssetSymbol, scenario.strikeAssetSymbol, scenario.strikeAssetDecimals)

      await mockUnderlyingAsset.deployed()
      await mockStrikeAsset.deployed()

      wPodCall = await PodCall.deploy(
        scenario.name,
        scenario.name,
        EXERCISE_TYPE_EUROPEAN,
        mockUnderlyingAsset.address,
        mockStrikeAsset.address,
        scenario.strikePrice,
        await getTimestamp() + 24 * 60 * 60 * 7,
        24 * 60 * 60 // 24h
      )

      await wPodCall.deployed()
    })

    async function MintPhase (amountOfOptionsToMint, signer = seller, owner = sellerAddress) {
      await wPodCall.connect(signer).mintEth(owner, { value: amountOfOptionsToMint })
    }

    // async function ExercisePhase (amountOfOptionsToExercise, signer = seller, receiver = buyer, receiverAddress = buyerAddress) {
    //   await podCall.connect(signer).transfer(receiverAddress, amountOfOptionsToExercise)
    //   await podCall.connect(receiver).exerciseEth({ value: amountOfOptionsToExercise })
    // }

    describe('Constructor/Initialization checks', () => {
      it('should have correct number of decimals for underlying and strike asset', async () => {
        expect(await wPodCall.strikeAssetDecimals()).to.equal(scenario.strikeAssetDecimals)
        expect(await wPodCall.underlyingAssetDecimals()).to.equal(scenario.underlyingAssetDecimals)
      })

      it('should have equal number of decimals PodCall and underlyingAsset', async () => {
        expect(await wPodCall.decimals()).to.equal(scenario.underlyingAssetDecimals)
      })

      it('should have equal number of decimals StrikePrice and strikeAsset', async () => {
        expect(await wPodCall.strikePriceDecimals()).to.equal(await wPodCall.strikeAssetDecimals())
      })
    })

    describe('Minting options', () => {
      it('should revert if user send 0 value to mint function', async () => {
        const balanceSeller = await ethers.provider.getBalance(sellerAddress)

        await expect(wPodCall.connect(seller).mintEth(sellerAddress, { value: 0 })).to.be.revertedWith('WPodCall: you can not mint zero options')
      })

      it('should mint, increase senders option balance and decrease sender ETH balance', async () => {
        const initialSellerBalanceUnderlying = await ethers.provider.getBalance(sellerAddress)

        const txMint = await wPodCall.connect(seller).mintEth(sellerAddress, { value: scenario.amountToMint.toString() })
        const txMintCost = await getTxCost(txMint)

        const finalSellerBalanceUnderlying = await ethers.provider.getBalance(sellerAddress)

        expect(await wPodCall.balanceOf(sellerAddress)).to.equal(scenario.amountToMint)
        expect(finalSellerBalanceUnderlying.add(txMintCost).add(scenario.amountToMint)).to.equal(initialSellerBalanceUnderlying)
      })
      it('should revert if user try to mint after expiration', async () => {
        await forceExpiration(wPodCall)
        await expect(wPodCall.connect(seller).mintEth(sellerAddress, { value: scenario.amountToMint.toString() })).to.be.revertedWith('PodOption: option has expired')
      })
    })

    describe('Exercising options', () => {
      it('should revert if user try to exercise before expiration', async () => {
        await wPodCall.connect(seller).mintEth(sellerAddress, { value: scenario.amountToMint })
        await wPodCall.connect(seller).transfer(buyerAddress, scenario.amountToMint)

        await mockStrikeAsset.connect(buyer).approve(wPodCall.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(buyer).mint(scenario.strikePrice.add(1))

        await expect(wPodCall.connect(buyer).exercise(scenario.amountToMint)).to.be.revertedWith('PodOption: option has not expired yet')
      })
      it('should revert if user have underlying enough (ETH), but do not have enough options', async () => {
        await forceExpiration(wPodCall)
        await expect(wPodCall.connect(buyer).exercise(scenario.amountToMint)).to.be.revertedWith('ERC20: burn amount exceeds balance')
      })
      it('should exercise and have all final balances matched', async () => {
        await wPodCall.connect(seller).mintEth(sellerAddress, { value: scenario.amountToMint })
        await wPodCall.connect(seller).transfer(buyerAddress, scenario.amountToMint)

        await mockStrikeAsset.connect(buyer).approve(wPodCall.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(buyer).mint(scenario.amountToMint.mul(scenario.strikePrice).add(1))

        const initialBuyerOptionBalance = await wPodCall.balanceOf(buyerAddress)
        const initialBuyerUnderlyingBalance = await ethers.provider.getBalance(buyerAddress)
        const initialContractUnderlyingReserves = await wPodCall.underlyingReserves()
        const initialContractOptionSupply = await wPodCall.totalSupply()

        expect(initialBuyerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialContractUnderlyingReserves).to.equal(scenario.amountToMint)
        expect(initialContractOptionSupply).to.equal(scenario.amountToMint)

        await forceExpiration(wPodCall)
        const txExercise = await wPodCall.connect(buyer).exercise(scenario.amountToMint)
        const txCost = await getTxCost(txExercise)

        const finalBuyerOptionBalance = await wPodCall.balanceOf(buyerAddress)
        const finalBuyerUnderlyingBalance = await ethers.provider.getBalance(buyerAddress)
        const finalContractUnderlyingReserves = await wPodCall.underlyingReserves()
        const finalContractStrikeReserves = await wPodCall.strikeReserves()
        const finalContractOptionSupply = await wPodCall.totalSupply()

        expect(finalBuyerOptionBalance).to.equal(0)
        expect(finalBuyerUnderlyingBalance).to.equal(initialBuyerUnderlyingBalance.add(scenario.amountToMint).sub(txCost))
        expect(finalContractUnderlyingReserves).to.equal(0)
        expect(finalContractStrikeReserves).to.equal(scenario.amountToMint.mul(scenario.strikePrice).div(ethers.BigNumber.from('10').pow(scenario.underlyingAssetDecimals)).add(1))
        expect(finalContractOptionSupply).to.equal(0)
      })
      it('should revert if user try to exercise after exercise window closed', async () => {
        await wPodCall.connect(seller).mintEth(sellerAddress, { value: scenario.amountToMint })
        await wPodCall.connect(seller).transfer(buyerAddress, scenario.amountToMint)
        await forceEndOfExerciseWindow(wPodCall)
        await expect(wPodCall.connect(seller).exercise(scenario.amountToMint)).to.be.revertedWith('PodOption: window of exercise has closed already')
      })
      it('should not be able to exercise zero options', async () => {
        await forceExpiration(wPodCall)
        await expect(wPodCall.connect(buyer).exercise(0))
          .to.be.revertedWith('WPodCall: you can not exercise zero options')
      })
    })

    describe('Unminting options', () => {
      it('should revert if try to unmint without amount', async () => {
        await expect(wPodCall.connect(seller).unmint(scenario.amountToMint)).to.be.revertedWith('WPodCall: you do not have minted options')
      })
      it('should revert if try to unmint amount higher than possible', async () => {
        await MintPhase(scenario.amountToMint)
        await expect(wPodCall.connect(seller).unmint(2 * scenario.amountToMint)).to.be.revertedWith('Exceed address minted options')
      })
      it('should unmint, destroy sender option, reduce its balance and send underlying back - European', async () => {
        await MintPhase(scenario.amountToMint)
        const initialSellerOptionBalance = await wPodCall.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialSellerUnderlyingBalance = await ethers.provider.getBalance(sellerAddress)
        const initialContractUnderlyingReserves = await wPodCall.underlyingReserves()
        const initialContractStrikeReserves = await wPodCall.strikeReserves()
        const initialContractOptionSupply = await wPodCall.totalSupply()

        expect(initialSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialSellerStrikeBalance).to.equal(0)
        expect(initialContractUnderlyingReserves).to.equal(scenario.amountToMint)
        expect(initialContractStrikeReserves).to.equal(0)
        expect(initialContractOptionSupply).to.equal(scenario.amountToMint)

        const txUnmint = await wPodCall.connect(seller).unmint(scenario.amountToMint)
        const txCost = await getTxCost(txUnmint)

        const finalSellerOptionBalance = await wPodCall.balanceOf(sellerAddress)
        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalSellerUnderlyingBalance = await ethers.provider.getBalance(sellerAddress)
        const finalContractUnderlyingReserves = await wPodCall.underlyingReserves()
        const finalContractStrikeReserves = await wPodCall.strikeReserves()
        const finalContractOptionSupply = await wPodCall.totalSupply()

        expect(finalSellerOptionBalance).to.equal(0)
        expect(finalSellerStrikeBalance).to.equal(0)
        expect(finalSellerUnderlyingBalance).to.equal(initialSellerUnderlyingBalance.add(scenario.amountToMint).sub(txCost))
        expect(finalContractStrikeReserves).to.equal(0)
        expect(finalContractOptionSupply).to.equal(0)
        expect(finalContractUnderlyingReserves).to.equal(0)
      })
      it('should unmint, destroy seller option, reduce its balance and send strike back counting interests (Ma-Mb-UNa)', async () => {
        await MintPhase(scenario.amountToMint)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)

        const initialBuyerOptionBalance = await wPodCall.balanceOf(buyerAddress)
        const initialBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)
        const initialBuyerUnderlyingBalance = await ethers.provider.getBalance(buyerAddress)
        const initialContractUnderlyingReserves = await wPodCall.underlyingReserves()
        const initialContractStrikeReserves = await wPodCall.strikeReserves()
        const initialContractOptionSupply = await wPodCall.totalSupply()

        expect(initialBuyerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialBuyerStrikeBalance).to.equal(0)
        expect(initialContractUnderlyingReserves).to.equal(scenario.amountToMint.mul(2))
        expect(initialContractStrikeReserves).to.equal(0)
        expect(initialContractOptionSupply).to.equal(scenario.amountToMint.mul(2))

        const txUnmint = await wPodCall.connect(buyer).unmint(scenario.amountToMint)
        const txCost = await getTxCost(txUnmint)

        const finalBuyerOptionBalance = await wPodCall.balanceOf(buyerAddress)
        const finalBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)
        const finalBuyerUnderlyingBalance = await ethers.provider.getBalance(buyerAddress)
        const finalContractUnderlyingReserves = await wPodCall.underlyingReserves()
        const finalContractStrikeReserves = await wPodCall.strikeReserves()
        const finalContractOptionSupply = await wPodCall.totalSupply()

        expect(finalBuyerOptionBalance).to.equal(0)
        expect(finalBuyerStrikeBalance).to.equal(0)
        expect(finalBuyerUnderlyingBalance).to.equal(initialBuyerUnderlyingBalance.add(scenario.amountToMint).sub(txCost))
        expect(finalContractStrikeReserves).to.equal(0)
        expect(finalContractOptionSupply).to.equal(scenario.amountToMint)
        expect(finalContractUnderlyingReserves).to.equal(scenario.amountToMint)
      })
      it('should not unmint if there is not enough options', async () => {
        await MintPhase(scenario.amountToMint)
        await expect(wPodCall.connect(seller).unmint(scenario.amountToMint.add(1)))
          .to.be.revertedWith('WPodCall: not enough minted options')
      })
    })

    describe('Withdrawing options', () => {
      it('should revert if user try to withdraw before expiration', async () => {
        await expect(wPodCall.connect(seller).withdraw()).to.be.revertedWith('PodOption: window of exercise has not ended yet')
      })

      it('should revert if user try to withdraw without balance after expiration', async () => {
        await forceEndOfExerciseWindow(wPodCall)
        await expect(wPodCall.connect(seller).withdraw()).to.be.revertedWith('WPodCall: you do not have balance to withdraw')
      })

      it('should seller withdraw Underlying Asset balance', async () => {
        await MintPhase(scenario.amountToMint)
        await wPodCall.connect(seller).transfer(buyerAddress, scenario.amountToMint)

        const initialSellerOptionBalance = await wPodCall.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialSellerUnderlyingBalance = await ethers.provider.getBalance(sellerAddress)
        const initialContractUnderlyingReserves = await wPodCall.underlyingReserves()
        const initialContractStrikeReserves = await wPodCall.strikeReserves()
        const initialContractOptionSupply = await wPodCall.totalSupply()

        expect(initialSellerOptionBalance).to.equal(0)
        expect(initialSellerStrikeBalance).to.equal(0)
        expect(initialContractUnderlyingReserves).to.equal(scenario.amountToMint)
        expect(initialContractStrikeReserves).to.equal(0)
        expect(initialContractOptionSupply).to.equal(scenario.amountToMint)

        await forceEndOfExerciseWindow(wPodCall)
        const txWithdraw = await wPodCall.connect(seller).withdraw()
        const txCost = await getTxCost(txWithdraw)

        const finalSellerOptionBalance = await wPodCall.balanceOf(sellerAddress)
        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalSellerUnderlyingBalance = await ethers.provider.getBalance(sellerAddress)
        const finalContractUnderlyingReserves = await wPodCall.underlyingReserves()
        const finalContractStrikeReserves = await wPodCall.strikeReserves()
        const finalContractOptionSupply = await wPodCall.totalSupply()

        expect(finalSellerOptionBalance).to.equal(0)
        expect(finalSellerStrikeBalance).to.equal(0)
        expect(finalSellerUnderlyingBalance).to.equal(initialSellerUnderlyingBalance.add(scenario.amountToMint).sub(txCost))
        expect(finalContractStrikeReserves).to.equal(0)
        expect(finalContractOptionSupply).to.equal(scenario.amountToMint)
        expect(finalContractUnderlyingReserves).to.equal(0)
        // Trying to re-withdraw
        await expect(wPodCall.connect(seller).withdraw()).to.be.revertedWith('WPodCall: you do not have balance to withdraw')
      })

      it('should withdraw Strike Asset balance plus interest earned proportional (Ma-Mb-Wa-Wb)', async () => {
        await MintPhase(scenario.amountToMint)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)

        const initialBuyerOptionBalance = await wPodCall.balanceOf(buyerAddress)
        const initialBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)
        const initialBuyerUnderlyingBalance = await ethers.provider.getBalance(buyerAddress)
        const initialContractUnderlyingReserves = await wPodCall.underlyingReserves()
        const initialContractStrikeReserves = await wPodCall.strikeReserves()
        const initialContractOptionSupply = await wPodCall.totalSupply()

        const initialSellerUnderlyingBalance = await ethers.provider.getBalance(sellerAddress)

        expect(initialBuyerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialBuyerStrikeBalance).to.equal(0)
        expect(initialContractUnderlyingReserves).to.equal(scenario.amountToMint.mul(2))
        expect(initialContractStrikeReserves).to.equal(0)
        expect(initialContractOptionSupply).to.equal(scenario.amountToMint.mul(2))

        await forceEndOfExerciseWindow(wPodCall)
        const txUnmint = await wPodCall.connect(buyer).withdraw()
        const txCost = await getTxCost(txUnmint)

        const txUnmint2 = await wPodCall.connect(seller).withdraw()
        const txCost2 = await getTxCost(txUnmint2)

        const finalBuyerOptionBalance = await wPodCall.balanceOf(buyerAddress)
        const finalBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)
        const finalBuyerUnderlyingBalance = await ethers.provider.getBalance(buyerAddress)
        const finalContractUnderlyingReserves = await wPodCall.underlyingReserves()
        const finalContractStrikeReserves = await wPodCall.strikeReserves()
        const finalContractOptionSupply = await wPodCall.totalSupply()

        const finalSellerUnderlyingBalance = await ethers.provider.getBalance(sellerAddress)

        expect(finalBuyerOptionBalance).to.equal(scenario.amountToMint)
        expect(finalBuyerStrikeBalance).to.equal(0)
        expect(finalBuyerUnderlyingBalance).to.equal(initialBuyerUnderlyingBalance.add(scenario.amountToMint).sub(txCost))
        expect(finalSellerUnderlyingBalance).to.equal(initialSellerUnderlyingBalance.add(scenario.amountToMint).sub(txCost2))
        expect(finalContractStrikeReserves).to.equal(0)
        expect(finalContractOptionSupply).to.equal(scenario.amountToMint.mul(2))
        expect(finalContractUnderlyingReserves).to.equal(0)
      })

      it('should withdraw mixed amount of Strike Asset and Underlying Asset (Ma-Mb-Ec-Wa-Wb)', async () => {
        await MintPhase(scenario.amountToMint)
        const halfAmountMint = ethers.BigNumber.from(scenario.amountToMint).div(2)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)

        await wPodCall.connect(seller).transfer(anotherAddress, scenario.amountToMint)

        await mockStrikeAsset.connect(another).approve(wPodCall.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(another).mint(scenario.amountToMint.mul(scenario.strikePrice).div(2).add(1))

        await forceExpiration(wPodCall)
        await wPodCall.connect(another).exercise(halfAmountMint)

        const initialBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)
        const initialBuyerUnderlyingBalance = await ethers.provider.getBalance(buyerAddress)

        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialSellerUnderlyingBalance = await ethers.provider.getBalance(sellerAddress)

        await forceEndOfExerciseWindow(wPodCall)
        const txUnmint = await wPodCall.connect(buyer).withdraw()
        const txCost = await getTxCost(txUnmint)

        const txUnmint2 = await wPodCall.connect(seller).withdraw()
        const txCost2 = await getTxCost(txUnmint2)

        const finalBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)
        const finalBuyerUnderlyingBalance = await ethers.provider.getBalance(buyerAddress)

        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalSellerUnderlyingBalance = await ethers.provider.getBalance(sellerAddress)

        const finalContractUnderlyingReserves = await wPodCall.underlyingReserves()
        const finalContractStrikeReserves = await wPodCall.strikeReserves()

        const earnedSellerStrike = finalSellerStrikeBalance.sub(initialSellerStrikeBalance)
        const earnedSellerUnderlying = finalSellerUnderlyingBalance.sub(initialSellerUnderlyingBalance).add(txCost2)
        const earnedSellerInUnitsOfUnderlying = earnedSellerStrike.mul(ethers.BigNumber.from('10').pow(scenario.underlyingAssetDecimals)).div(scenario.strikePrice)
        const totalEarnedSeller = earnedSellerUnderlying.add(earnedSellerInUnitsOfUnderlying)

        const earnedBuyerStrike = finalBuyerStrikeBalance.sub(initialBuyerStrikeBalance)
        const earnedBuyerUnderlying = finalBuyerUnderlyingBalance.sub(initialBuyerUnderlyingBalance).add(txCost)
        const earnedBuyerInUnitsOfUnderlying = earnedBuyerStrike.mul(ethers.BigNumber.from('10').pow(scenario.underlyingAssetDecimals)).div(scenario.strikePrice)
        const totalEarnedBuyer = earnedBuyerUnderlying.add(earnedBuyerInUnitsOfUnderlying)

        expect(totalEarnedBuyer).to.gte(scenario.amountToMint)
        expect(totalEarnedSeller).to.gte(scenario.amountToMint)

        expect(finalContractStrikeReserves).to.equal(0)
        expect(finalContractUnderlyingReserves).to.equal(0)
        expect(finalContractStrikeReserves).to.equal(0)
      })
    })
  })
})
