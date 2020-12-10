const { expect } = require('chai')
const getTxCost = require('../util/getTxCost')
const forceExpiration = require('../util/forceExpiration')
const forceEndOfExerciseWindow = require('../util/forceEndOfExerciseWindow')
const getTimestamp = require('../util/getTimestamp')

const EXERCISE_TYPE_EUROPEAN = 0 // European
const OPTION_TYPE_PUT = 0 // Put

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
  describe('WPodPut.sol - ' + scenario.name, () => {
    let mockUnderlyingAsset
    let mockStrikeAsset
    let factoryContract
    let wPodPut
    let deployer
    let deployerAddress
    let seller
    let another
    let anotherAddress
    let sellerAddress
    let buyer
    let buyerAddress
    let txIdNewOption

    before(async function () {
      [deployer, seller, buyer, another] = await ethers.getSigners()
      deployerAddress = await deployer.getAddress()
      sellerAddress = await seller.getAddress()
      buyerAddress = await buyer.getAddress()
      anotherAddress = await another.getAddress()

      // 1) Deploy Factory
    })

    beforeEach(async function () {
      // const aPodPut = await ethers.getContractFactory('aPodPut')
      const MockInterestBearingERC20 = await ethers.getContractFactory('MintableInterestBearing')
      const MockWETH = await ethers.getContractFactory('WETH')
      const WPodPut = await ethers.getContractFactory('WPodPut')

      mockUnderlyingAsset = await MockWETH.deploy()
      mockStrikeAsset = await MockInterestBearingERC20.deploy(scenario.strikeAssetSymbol, scenario.strikeAssetSymbol, scenario.strikeAssetDecimals)

      await mockUnderlyingAsset.deployed()
      await mockStrikeAsset.deployed()

      // call transaction
      wPodPut = await WPodPut.deploy(
        scenario.name,
        scenario.name,
        EXERCISE_TYPE_EUROPEAN,
        mockUnderlyingAsset.address,
        mockStrikeAsset.address,
        scenario.strikePrice,
        await getTimestamp() + 24 * 60 * 60 * 7,
        24 * 60 * 60 // 24h
      )

      await wPodPut.deployed()
    })

    async function MintPhase (amountOfOptionsToMint, signer = seller, owner = sellerAddress) {
      const signerAddress = await signer.getAddress()
      expect(await wPodPut.balanceOf(signerAddress)).to.equal(0)
      const optionsDecimals = await wPodPut.decimals()
      await mockStrikeAsset.connect(signer).approve(wPodPut.address, ethers.constants.MaxUint256)
      // calculate amount of Strike necessary to mint
      const numberOfOptionsInteger = amountOfOptionsToMint.div(ethers.BigNumber.from(10).pow(optionsDecimals))
      await mockStrikeAsset.connect(signer).mint(scenario.strikePrice.mul(numberOfOptionsInteger).add(1))

      await wPodPut.connect(signer).mint(amountOfOptionsToMint, owner)
      expect(await wPodPut.balanceOf(signerAddress)).to.equal(amountOfOptionsToMint)
      expect(await mockStrikeAsset.balanceOf(signerAddress)).to.equal(0)
    }

    async function ExercisePhase (amountOfOptionsToExercise, signer = seller, receiver = buyer, receiverAddress = buyerAddress) {
      await wPodPut.connect(signer).transfer(receiverAddress, amountOfOptionsToExercise)
      await wPodPut.connect(receiver).exerciseEth({ value: amountOfOptionsToExercise })
    }

    describe('Constructor/Initialization checks', () => {
      it('should have correct number of decimals for underlying and strike asset', async () => {
        expect(await wPodPut.strikeAssetDecimals()).to.equal(scenario.strikeAssetDecimals)
        expect(await wPodPut.underlyingAssetDecimals()).to.equal(scenario.underlyingAssetDecimals)
      })

      it('should have equal number of decimals aPodPut and underlyingAsset', async () => {
        expect(await wPodPut.decimals()).to.equal(scenario.underlyingAssetDecimals)
      })

      it('should have equal number of decimals StrikePrice and strikeAsset', async () => {
        expect(await wPodPut.strikePriceDecimals()).to.equal(await wPodPut.strikeAssetDecimals())
      })
    })

    describe('Minting options', () => {
      it('should revert if user dont have enough collateral', async () => {
        expect(await wPodPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(wPodPut.address, ethers.constants.MaxUint256)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)
        await expect(wPodPut.connect(seller).mint(scenario.amountToMint, sellerAddress)).to.be.revertedWith('ERC20: transfer amount exceeds balance')
      })

      it('should revert if user do not approve collateral to be spent by WPodPut', async () => {
        expect(await wPodPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice.add(1))

        await expect(wPodPut.connect(seller).mint(scenario.amountToMint, sellerAddress)).to.be.revertedWith('ERC20: transfer amount exceeds allowance')
      })

      it('should revert if asked amount is too low', async () => {
        const minimumAmount = ethers.BigNumber.from(scenario.strikePrice.add(1)).div((10 ** await mockUnderlyingAsset.decimals()).toString())

        if (minimumAmount.gt(0)) return

        expect(await wPodPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(wPodPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice.add(1))

        await expect(wPodPut.connect(seller).mint(scenario.amountToMintTooLow, sellerAddress)).to.be.revertedWith('PodOption: amount of options is too low')
      })

      it('should mint, increase senders option balance and decrease sender strike balance', async () => {
        expect(await wPodPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(wPodPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice.add(1))

        await wPodPut.connect(seller).mint(scenario.amountToMint, sellerAddress)
        expect(await wPodPut.balanceOf(sellerAddress)).to.equal(scenario.amountToMint)
        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)
      })
      it('should revert if user try to mint after expiration', async () => {
        expect(await wPodPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(wPodPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        await forceExpiration(wPodPut)
        await expect(wPodPut.connect(seller).mint(scenario.amountToMint, sellerAddress)).to.be.revertedWith('PodOption: option has expired')
      })
    })

    describe('Exercising options', () => {
      it('should revert if user try to exercise before expiration', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await wPodPut.connect(seller).transfer(buyerAddress, scenario.amountToMint)
        await expect(wPodPut.connect(seller).exerciseEth({ value: scenario.amountToMint })).to.be.revertedWith('PodOption: option has not expired yet')
      })
      it('should revert if user have underlying enough, but dont have enough options', async () => {
        expect(await ethers.provider.getBalance(buyerAddress)).to.gte(scenario.amountToMint)
        await forceExpiration(wPodPut)
        await expect(wPodPut.connect(buyer).exerciseEth({ value: scenario.amountToMint })).to.be.revertedWith('ERC20: burn amount exceeds balance')
      })

      it('should exercise and have all final balances matched', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await wPodPut.connect(seller).transfer(buyerAddress, scenario.amountToMint)

        const initialBuyerOptionBalance = await wPodPut.balanceOf(buyerAddress)
        const initialBuyerUnderlyingBalance = await ethers.provider.getBalance(buyerAddress)
        const initialContractUnderlyingReserves = await wPodPut.underlyingReserves()
        const initialContractStrikeReserves = await wPodPut.strikeReserves()
        const initialContractOptionSupply = await wPodPut.totalSupply()

        expect(initialBuyerOptionBalance).to.equal(scenario.amountToMint)
        // expect(initialBuyerUnderlyingBalance).to.equal(scenario.amountToMint)
        expect(initialContractUnderlyingReserves).to.equal(0)
        expect(initialContractStrikeReserves).to.equal(scenario.strikePrice.add(1))
        expect(initialContractOptionSupply).to.equal(scenario.amountToMint)

        await forceExpiration(wPodPut)
        const txExercise = await wPodPut.connect(buyer).exerciseEth({ value: scenario.amountToMint })

        const txCost = await getTxCost(txExercise)
        const finalBuyerOptionBalance = await wPodPut.balanceOf(buyerAddress)
        const finalBuyerUnderlyingBalance = await ethers.provider.getBalance(buyerAddress)
        const finalContractUnderlyingReserves = await wPodPut.underlyingReserves()
        const finalContractStrikeReserves = await wPodPut.strikeReserves()
        const finalContractOptionSupply = await wPodPut.totalSupply()

        expect(finalBuyerOptionBalance).to.equal(0)
        expect(finalBuyerUnderlyingBalance).to.equal(initialBuyerUnderlyingBalance.sub(scenario.amountToMint).sub(txCost))
        expect(finalContractUnderlyingReserves).to.equal(scenario.amountToMint)
        expect(finalContractStrikeReserves).to.equal(0)
        expect(finalContractOptionSupply).to.equal(0)
      })
      it('should revert if user try to exercise after exercise window closed', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await wPodPut.connect(seller).transfer(buyerAddress, scenario.amountToMint)
        await forceEndOfExerciseWindow(wPodPut)
        await expect(wPodPut.connect(seller).exerciseEth({ value: scenario.amountToMint })).to.be.revertedWith('PodOption: window of exercise has closed already')
      })
      it('should not be able to exercise zero options', async () => {
        await forceExpiration(wPodPut)
        await expect(wPodPut.connect(buyer).exerciseEth({ value: 0 }))
          .to.be.revertedWith('WPodPut: you can not exercise zero options')
      })
    })

    describe('Unminting options', () => {
      it('should revert if try to unmint without amount', async () => {
        await expect(wPodPut.connect(seller).unmint(scenario.amountToMint)).to.be.revertedWith('WPodPut: you do not have minted options')
      })
      it('should revert if try to unmint amount higher than possible', async () => {
        await MintPhase(scenario.amountToMint)
        await expect(wPodPut.connect(seller).unmint(2 * scenario.amountToMint)).to.be.revertedWith('Exceed address minted options')
      })
      it('should revert if unmint amount is too low', async () => {
        const minimumAmount = ethers.BigNumber.from(scenario.strikePrice).div((10 ** await mockUnderlyingAsset.decimals()).toString())
        if (minimumAmount.gt(0)) return
        await MintPhase(scenario.amountToMint)
        await expect(wPodPut.connect(seller).unmint(scenario.amountToMintTooLow, sellerAddress)).to.be.revertedWith('PodOption: amount of options is too low')
      })
      it('should unmint, destroy sender option, reduce its balance and send strike back (Without Exercise Scenario)', async () => {
        await MintPhase(scenario.amountToMint)
        const initialSellerOptionBalance = await wPodPut.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialContractUnderlyingReserves = await wPodPut.underlyingReserves()
        const initialContractStrikeReserves = await wPodPut.strikeReserves()
        const initialContractOptionSupply = await wPodPut.totalSupply()

        expect(initialSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialSellerStrikeBalance).to.equal(0)
        expect(initialContractUnderlyingReserves).to.equal(0)
        expect(initialContractStrikeReserves).to.equal(scenario.strikePrice.add(1))
        expect(initialContractOptionSupply).to.equal(scenario.amountToMint)
        await expect(wPodPut.connect(seller).unmint(scenario.amountToMint)).to.not.be.reverted

        const finalSellerOptionBalance = await wPodPut.balanceOf(sellerAddress)
        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractUnderlyingReserves = await wPodPut.underlyingReserves()
        const finalContractStrikeReserves = await wPodPut.strikeReserves()
        const finalContractOptionSupply = await wPodPut.totalSupply()

        expect(finalSellerOptionBalance).to.equal(0)
        expect(finalSellerStrikeBalance).to.equal(scenario.strikePrice.add(1))
        expect(finalContractStrikeReserves).to.equal(0)
        expect(finalContractOptionSupply).to.equal(0)
        expect(finalContractUnderlyingReserves).to.equal(0)
      })
      it('should unmint, destroy seller option, reduce its balance and send strike back counting interests (Ma-Mb-UNa)', async () => {
        await MintPhase(scenario.amountToMint)
        await mockStrikeAsset.earnInterest(wPodPut.address)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)
        await mockStrikeAsset.earnInterest(wPodPut.address)

        const initialSellerOptionBalance = await wPodPut.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialContractUnderlyingReserves = await wPodPut.underlyingReserves()
        const initialContractStrikeReserves = await wPodPut.strikeReserves()
        const initialContractOptionSupply = await wPodPut.totalSupply()

        await expect(wPodPut.connect(seller).unmint(scenario.amountToMint)).to.not.be.reverted

        const finalSellerOptionBalance = await wPodPut.balanceOf(sellerAddress)
        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractUnderlyingReserves = await wPodPut.underlyingReserves()
        const finalContractStrikeReserves = await wPodPut.strikeReserves()
        const finalContractOptionSupply = await wPodPut.totalSupply()

        expect(finalSellerOptionBalance).to.equal(initialSellerOptionBalance.sub(scenario.amountToMint))
        expect(finalSellerStrikeBalance).to.gte(initialSellerStrikeBalance.add(scenario.strikePrice))
        expect(finalContractStrikeReserves).to.gte(scenario.strikePrice)
        expect(finalContractOptionSupply).to.equal(initialContractOptionSupply.sub(scenario.amountToMint))
        expect(finalContractUnderlyingReserves).to.equal(initialContractUnderlyingReserves)
      })
      it('should unmint, destroy seller option, reduce its balance and send strike back counting interests (Ma-Mb-UNa-UNb)', async () => {
        await MintPhase(scenario.amountToMint)
        await mockStrikeAsset.earnInterest(wPodPut.address)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)
        await mockStrikeAsset.earnInterest(wPodPut.address)
        await expect(wPodPut.connect(seller).unmint(scenario.amountToMint))

        const initialContractUnderlyingReserves = await wPodPut.underlyingReserves()

        await expect(wPodPut.connect(buyer).unmint(scenario.amountToMint))

        const finalBuyerOptionBalance = await wPodPut.balanceOf(sellerAddress)
        const finalBuyerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractStrikeReserves = await wPodPut.strikeReserves()
        const finalContractOptionSupply = await wPodPut.totalSupply()
        const finalContractUnderlyingReserves = await wPodPut.underlyingReserves()

        expect(finalBuyerOptionBalance).to.equal(0)
        expect(finalBuyerStrikeBalance).to.gte(scenario.strikePrice) // earned interests
        expect(finalContractStrikeReserves).to.equal(0)
        expect(finalContractOptionSupply).to.equal(0)
        expect(finalContractUnderlyingReserves).to.equal(initialContractUnderlyingReserves)
      })
      it('should not unmint if there is not enough options', async () => {
        await MintPhase(scenario.amountToMint)
        await expect(wPodPut.connect(seller).unmint(scenario.amountToMint.add(1)))
          .to.be.revertedWith('WPodPut: not enough minted options')
      })
      it('should revert if user try to unmint after expiration', async () => {
        await forceExpiration(wPodPut)
        await expect(wPodPut.connect(seller).unmint()).to.be.revertedWith('PodOption: option has not expired yet')
      })
    })

    describe('Withdrawing options', () => {
      it('should revert if user try to withdraw before expiration', async () => {
        await expect(wPodPut.connect(seller).withdraw()).to.be.revertedWith('PodOption: window of exercise has not ended yet')
      })

      it('should revert if user try to withdraw without balance after expiration', async () => {
        // Set Expiration
        await forceEndOfExerciseWindow(wPodPut)
        await expect(wPodPut.connect(seller).withdraw()).to.be.revertedWith('WPodPut: you do not have balance to withdraw')
      })

      it('should withdraw Strike Asset balance plus interest earned', async () => {
        await MintPhase(scenario.amountToMint)
        // Earned 10% interest
        await mockStrikeAsset.earnInterest(wPodPut.address)
        const earnedInterest = scenario.strikePrice.div(ethers.BigNumber.from('100'))
        // Set Expiration
        const initialSellerOptionBalance = await wPodPut.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialContractStrikeReserves = await wPodPut.strikeReserves()

        expect(initialSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialSellerStrikeBalance).to.equal(0)
        expect(initialContractStrikeReserves).to.equal(scenario.strikePrice.add(earnedInterest).add(1))

        await forceEndOfExerciseWindow(wPodPut)
        await wPodPut.connect(seller).withdraw()

        const finalSellerOptionBalance = await wPodPut.balanceOf(sellerAddress)
        const finalSellerStrikegBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractStrikeReserves = await wPodPut.strikeReserves()

        expect(finalSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(finalSellerStrikegBalance).to.equal(scenario.strikePrice.add(earnedInterest).add(1))
        expect(finalContractStrikeReserves).to.equal(0)
        // Cant withdraw two times in a row
        // await expect(aPodPut.connect(seller).withdraw()).to.be.revertedWith('WPodPut: you do not have balance to withdraw')
      })

      it('should withdraw Strike Asset balance plus interest earned proportional (Ma-Mb-Wa-Wb)', async () => {
        // seller 1
        await MintPhase(scenario.amountToMint)

        await mockStrikeAsset.earnInterest(wPodPut.address)

        // seller 1
        const twoTimesAmountToMint = scenario.amountToMint.mul(ethers.BigNumber.from('2'))
        const twoTimesAmountOfCollateral = scenario.strikePrice.mul(ethers.BigNumber.from('2'))
        await MintPhase(twoTimesAmountToMint, buyer, buyerAddress)
        const optionNumberOfDecimals = await wPodPut.decimals()
        const optionDecimals = ethers.BigNumber.from('10').pow(optionNumberOfDecimals)
        // Earned 10% interest
        await mockStrikeAsset.earnInterest(wPodPut.address)
        // Set Expiration
        const initialSellerOptionBalance = await wPodPut.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialContractStrikeReserves = await wPodPut.strikeReserves()

        expect(initialSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialSellerStrikeBalance).to.equal(0)
        expect(initialContractStrikeReserves).to.gt(twoTimesAmountOfCollateral)

        await forceEndOfExerciseWindow(wPodPut)
        await wPodPut.connect(seller).withdraw()

        const finalSellerOptionBalance = await wPodPut.balanceOf(sellerAddress)
        const finalSellerStrikegBalance = await mockStrikeAsset.balanceOf(sellerAddress)

        expect(finalSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(finalSellerStrikegBalance).to.gt(scenario.strikePrice)
        expect(finalSellerStrikegBalance).to.lt(scenario.strikePrice.mul(twoTimesAmountToMint).div(optionDecimals))
        // Cant withdraw two times in a row
        await expect(wPodPut.connect(seller).withdraw()).to.be.revertedWith('WPodPut: you do not have balance to withdraw')

        await wPodPut.connect(buyer).withdraw()

        const finalBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)
        const finalContractStrikeReserves = await wPodPut.strikeReserves()

        expect(finalBuyerStrikeBalance).to.gt(scenario.strikePrice.mul(twoTimesAmountToMint).div(optionDecimals))
        expect(finalContractStrikeReserves).to.equal(0)
        await expect(wPodPut.connect(buyer).withdraw()).to.be.revertedWith('WPodPut: you do not have balance to withdraw')
      })

      it('should withdraw mixed amount of Strike Asset and Underlying Asset (Ma-Mb-Ec-Wa-Wb)', async () => {
        // Ma => Mint with user A (seller)
        await MintPhase(scenario.amountToMint)
        await mockStrikeAsset.earnInterest(wPodPut.address)
        const halfAmountMint = ethers.BigNumber.from(scenario.amountToMint).div(2)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)
        await mockStrikeAsset.earnInterest(wPodPut.address)

        await forceExpiration(wPodPut)
        await ExercisePhase(halfAmountMint, seller, another, anotherAddress)

        const optionNumberOfDecimals = await wPodPut.decimals()
        const optionDecimals = ethers.BigNumber.from('10').pow(optionNumberOfDecimals)

        // Checking balance before withdraw
        const initialSellerUnderlyingBalance = await ethers.provider.getBalance(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)

        await forceEndOfExerciseWindow(wPodPut)
        const txWithdraw = await wPodPut.connect(seller).withdraw()
        const txCost = await getTxCost(txWithdraw)
        await expect(wPodPut.connect(seller).withdraw()).to.be.revertedWith('WPodPut: you do not have balance to withdraw')

        const finalSellerUnderlyingBalance = await ethers.provider.getBalance(sellerAddress)
        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)

        const earnedSellerStrike = finalSellerStrikeBalance.sub(initialSellerStrikeBalance)
        const earnedSellerUnderlying = finalSellerUnderlyingBalance.sub(initialSellerUnderlyingBalance).add(txCost)
        const earnedSellerInUnitsOfStrike = earnedSellerUnderlying.mul(scenario.strikePrice).div(optionDecimals)
        const totalEarned = earnedSellerStrike.add(earnedSellerInUnitsOfStrike)

        const initialSellerStriked = await wPodPut.strikeToTransfer(scenario.amountToMint)

        expect(totalEarned).to.gte(initialSellerStriked)

        const initialBuyerUnderlyingBalance = await ethers.provider.getBalance(buyerAddress)
        const initialBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)

        const txWithdrawBuyer = await wPodPut.connect(buyer).withdraw()
        const txCostBuyer = await getTxCost(txWithdrawBuyer)
        await expect(wPodPut.connect(buyer).withdraw()).to.be.revertedWith('WPodPut: you do not have balance to withdraw')

        const finalBuyerUnderlyingBalance = await ethers.provider.getBalance(buyerAddress)
        const finalBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)

        const earnedBuyerStrike = finalBuyerStrikeBalance.sub(initialBuyerStrikeBalance)
        const earnedBuyerUnderlying = finalBuyerUnderlyingBalance.sub(initialBuyerUnderlyingBalance).add(txCostBuyer)
        const earnedBuyerInUnitsOfStrike = earnedBuyerUnderlying.mul(scenario.strikePrice).div(optionDecimals)
        const totalEarnedBuyer = earnedBuyerStrike.add(earnedBuyerInUnitsOfStrike)

        const initialBuyerStriked = await wPodPut.strikeToTransfer(scenario.amountToMint)

        expect(totalEarnedBuyer).to.gte(initialBuyerStriked)
      })
    })
  })
})
