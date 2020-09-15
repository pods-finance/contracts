const { expect } = require('chai')
const getTxCost = require('./util/getTxCost')
const forceExpiration = require('./util/forceExpiration')
const getTimestamp = require('./util/getTimestamp')

const OPTION_TYPE_PUT = 0

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
    strikePrice: ethers.BigNumber.from(300e6.toString()),
    strikePriceDecimals: 6,
    amountToMint: ethers.BigNumber.from(1e18.toString()),
    amountToMintTooLow: 1
  }
]
scenarios.forEach(scenario => {
  describe('waPodPut.sol - ' + scenario.name, () => {
    let mockUnderlyingAsset
    let mockStrikeAsset
    let factoryContract
    let waPodPut
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
      const ContractFactory = await ethers.getContractFactory('aOptionFactory')

      mockUnderlyingAsset = await MockWETH.deploy()
      mockStrikeAsset = await MockInterestBearingERC20.deploy(scenario.strikeAssetSymbol, scenario.strikeAssetSymbol, scenario.strikeAssetDecimals)
      factoryContract = await ContractFactory.deploy(mockUnderlyingAsset.address)

      await factoryContract.deployed()
      await mockUnderlyingAsset.deployed()
      await mockStrikeAsset.deployed()

      // call transaction
      txIdNewOption = await factoryContract.createEthOption(
        scenario.name,
        scenario.name,
        OPTION_TYPE_PUT,
        mockStrikeAsset.address,
        scenario.strikePrice,
        await getTimestamp() + 5 * 60 * 60 * 1000
      )

      const filterFrom = await factoryContract.filters.OptionCreated(deployerAddress)
      const eventDetails = await factoryContract.queryFilter(filterFrom, txIdNewOption.blockNumber, txIdNewOption.blockNumber)

      if (eventDetails.length) {
        const { option } = eventDetails[0].args
        waPodPut = await ethers.getContractAt('waPodPut', option)
      } else {
        console.log('Something went wrong: No events found')
      }

      await waPodPut.deployed()
    })

    async function MintPhase (amountOfOptionsToMint, signer = seller, owner = sellerAddress) {
      const signerAddress = await signer.getAddress()
      expect(await waPodPut.balanceOf(signerAddress)).to.equal(0)
      const optionsDecimals = await waPodPut.decimals()
      await mockStrikeAsset.connect(signer).approve(waPodPut.address, ethers.constants.MaxUint256)
      // calculate amount of Strike necessary to mint
      const numberOfOptionsInteger = amountOfOptionsToMint.div(ethers.BigNumber.from(10).pow(optionsDecimals))
      await mockStrikeAsset.connect(signer).mint(scenario.strikePrice.mul(numberOfOptionsInteger))

      expect(await mockStrikeAsset.balanceOf(signerAddress)).to.equal(scenario.strikePrice.mul(numberOfOptionsInteger))
      await waPodPut.connect(signer).mint(amountOfOptionsToMint, owner)
      expect(await waPodPut.balanceOf(signerAddress)).to.equal(amountOfOptionsToMint)
      expect(await mockStrikeAsset.balanceOf(signerAddress)).to.equal(0)
    }

    async function ExercisePhase (amountOfOptionsToExercise, signer = seller, receiver = buyer, receiverAddress = buyerAddress) {
      await waPodPut.connect(signer).transfer(receiverAddress, amountOfOptionsToExercise)
      await waPodPut.connect(receiver).exerciseEth({ value: amountOfOptionsToExercise })
    }

    describe('Constructor/Initialization checks', () => {
      it('should have correct number of decimals for underlying and strike asset', async () => {
        expect(await waPodPut.strikeAssetDecimals()).to.equal(scenario.strikeAssetDecimals)
        expect(await waPodPut.underlyingAssetDecimals()).to.equal(scenario.underlyingAssetDecimals)
      })

      it('should have equal number of decimals aPodPut and underlyingAsset', async () => {
        expect(await waPodPut.decimals()).to.equal(scenario.underlyingAssetDecimals)
      })

      it('should have equal number of decimals StrikePrice and strikeAsset', async () => {
        expect(await waPodPut.strikePriceDecimals()).to.equal(await waPodPut.strikeAssetDecimals())
      })
    })

    describe('Minting options', () => {
      it('should revert if user dont have enough collateral', async () => {
        expect(await waPodPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(waPodPut.address, ethers.constants.MaxUint256)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)
        await expect(waPodPut.connect(seller).mint(scenario.amountToMint, sellerAddress)).to.be.revertedWith('ERC20: transfer amount exceeds balance')
      })

      it('should revert if user do not approve collateral to be spended by aPodPut', async () => {
        expect(await waPodPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)

        await expect(waPodPut.connect(seller).mint(scenario.amountToMint, sellerAddress)).to.be.revertedWith('ERC20: transfer amount exceeds allowance')
      })

      it('should revert if asked amount is too low', async () => {
        const minimumAmount = ethers.BigNumber.from(scenario.strikePrice).div((10 ** await mockUnderlyingAsset.decimals()).toString())

        if (minimumAmount.gt(0)) return

        expect(await waPodPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(waPodPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)
        await expect(waPodPut.connect(seller).mint(scenario.amountToMintTooLow, sellerAddress)).to.be.revertedWith('Amount too low')
      })

      it('should mint, increase senders option balance and decrease sender strike balance', async () => {
        expect(await waPodPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(waPodPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)
        await waPodPut.connect(seller).mint(scenario.amountToMint, sellerAddress)
        expect(await waPodPut.balanceOf(sellerAddress)).to.equal(scenario.amountToMint)
        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)
      })
      it('should increase contract balance after time passed', async () => {
        expect(await waPodPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(waPodPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)
        await waPodPut.connect(seller).mint(scenario.amountToMint, sellerAddress)
        expect(await waPodPut.balanceOf(sellerAddress)).to.equal(scenario.amountToMint)
        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)
        const strikeBalanceBefore = await waPodPut.connect(seller).strikeBalance()
        await mockStrikeAsset.connect(seller).earnInterest(waPodPut.address)
        expect(await waPodPut.connect(seller).strikeBalance()).to.gte(strikeBalanceBefore)
      })
      it('should revert if user try to mint after expiration', async () => {
        expect(await waPodPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(waPodPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)
        await forceExpiration(waPodPut)
        await expect(waPodPut.connect(seller).mint(scenario.amountToMint, sellerAddress)).to.be.revertedWith('Option has expired')
      })
    })

    describe('Exercising options', () => {
      it('should revert if user have underlying enough, but dont have enough options', async () => {
        expect(await ethers.provider.getBalance(buyerAddress)).to.gte(scenario.amountToMint)
        await expect(waPodPut.connect(buyer).exerciseEth({ value: scenario.amountToMint })).to.be.revertedWith('ERC20: burn amount exceeds balance')
      })

      it('should exercise and have all final balances matched', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await waPodPut.connect(seller).transfer(buyerAddress, scenario.amountToMint)

        const initialBuyerOptionBalance = await waPodPut.balanceOf(buyerAddress)
        const initialBuyerUnderlyingBalance = await ethers.provider.getBalance(buyerAddress)
        const initialContractUnderlyingBalance = await waPodPut.underlyingBalance()
        const initialContractStrikeBalance = await waPodPut.strikeBalance()
        const initialContractOptionSupply = await waPodPut.totalSupply()

        expect(initialBuyerOptionBalance).to.equal(scenario.amountToMint)
        // expect(initialBuyerUnderlyingBalance).to.equal(scenario.amountToMint)
        expect(initialContractUnderlyingBalance).to.equal(0)
        expect(initialContractStrikeBalance).to.equal(scenario.strikePrice)
        expect(initialContractOptionSupply).to.equal(scenario.amountToMint)
        const txExercise = await waPodPut.connect(buyer).exerciseEth({ value: scenario.amountToMint })

        const txCost = await getTxCost(txExercise)
        const finalBuyerOptionBalance = await waPodPut.balanceOf(buyerAddress)
        const finalBuyerUnderlyingBalance = await ethers.provider.getBalance(buyerAddress)
        const finalContractUnderlyingBalance = await waPodPut.underlyingBalance()
        const finalContractStrikeBalance = await waPodPut.strikeBalance()
        const finalContractOptionSupply = await waPodPut.totalSupply()

        expect(finalBuyerOptionBalance).to.equal(0)
        expect(finalBuyerUnderlyingBalance).to.equal(initialBuyerUnderlyingBalance.sub(scenario.amountToMint).sub(txCost))
        expect(finalContractUnderlyingBalance).to.equal(scenario.amountToMint)
        expect(finalContractStrikeBalance).to.equal(0)
        expect(finalContractOptionSupply).to.equal(0)
      })
      it('should revert if user try to exercise after expiration', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await waPodPut.connect(seller).transfer(buyerAddress, scenario.amountToMint)
        await forceExpiration(waPodPut)
        await expect(waPodPut.connect(seller).exerciseEth({ value: scenario.amountToMint })).to.be.revertedWith('Option has expired')
      })
    })

    describe('Unwinding options', () => {
      it('should revert if try to unwind without amount', async () => {
        await expect(waPodPut.connect(seller).unwind(scenario.amountToMint)).to.be.revertedWith('You do not have minted options')
      })
      it('should revert if try to unwind amount higher than possible', async () => {
        await MintPhase(scenario.amountToMint)
        await expect(waPodPut.connect(seller).unwind(2 * scenario.amountToMint)).to.be.revertedWith('Exceed address minted options')
      })
      it('should revert if unwind amount is too low', async () => {
        const minimumAmount = ethers.BigNumber.from(scenario.strikePrice).div((10 ** await mockUnderlyingAsset.decimals()).toString())
        if (minimumAmount.gt(0)) return
        await MintPhase(scenario.amountToMint)
        await expect(waPodPut.connect(seller).unwind(scenario.amountToMintTooLow, sellerAddress)).to.be.revertedWith('Amount too low')
      })
      it('should unwind, destroy sender option, reduce his balance and send strike back (Without Exercise Scenario)', async () => {
        await MintPhase(scenario.amountToMint)
        const initialSellerOptionBalance = await waPodPut.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialContractUnderlyingBalance = await waPodPut.underlyingBalance()
        const initialContractStrikeBalance = await waPodPut.strikeBalance()
        const initialContractOptionSupply = await waPodPut.totalSupply()

        expect(initialSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialSellerStrikeBalance).to.equal(0)
        expect(initialContractUnderlyingBalance).to.equal(0)
        expect(initialContractStrikeBalance).to.equal(scenario.strikePrice)
        expect(initialContractOptionSupply).to.equal(scenario.amountToMint)
        await expect(waPodPut.connect(seller).unwind(scenario.amountToMint))

        const finalSellerOptionBalance = await waPodPut.balanceOf(sellerAddress)
        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractUnderlyingBalance = await waPodPut.underlyingBalance()
        const finalContractStrikeBalance = await waPodPut.strikeBalance()
        const finalContractOptionSupply = await waPodPut.totalSupply()

        expect(finalSellerOptionBalance).to.equal(0)
        expect(finalSellerStrikeBalance).to.equal(scenario.strikePrice)
        expect(finalContractStrikeBalance).to.equal(0)
        expect(finalContractOptionSupply).to.equal(0)
        expect(finalContractUnderlyingBalance).to.equal(0)
      })
      it('should unwind, destroy seller option, reduce his balance and send strike back counting interests (Ma-Mb-UNa)', async () => {
        await MintPhase(scenario.amountToMint)
        await mockStrikeAsset.earnInterest(waPodPut.address)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)
        await mockStrikeAsset.earnInterest(waPodPut.address)

        const initialSellerOptionBalance = await waPodPut.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialContractUnderlyingBalance = await waPodPut.underlyingBalance()
        const initialContractStrikeBalance = await waPodPut.strikeBalance()
        const initialContractOptionSupply = await waPodPut.totalSupply()

        await expect(waPodPut.connect(seller).unwind(scenario.amountToMint))

        const finalSellerOptionBalance = await waPodPut.balanceOf(sellerAddress)
        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractUnderlyingBalance = await waPodPut.underlyingBalance()
        const finalContractStrikeBalance = await waPodPut.strikeBalance()
        const finalContractOptionSupply = await waPodPut.totalSupply()

        expect(finalSellerOptionBalance).to.equal(initialSellerOptionBalance.sub(scenario.amountToMint))
        expect(finalSellerStrikeBalance).to.gte(initialSellerStrikeBalance.add(scenario.strikePrice))
        expect(finalContractStrikeBalance).to.gte(scenario.strikePrice)
        expect(finalContractOptionSupply).to.equal(initialContractOptionSupply.sub(scenario.amountToMint))
        expect(finalContractUnderlyingBalance).to.equal(initialContractUnderlyingBalance)
      })
      it('should unwind, destroy seller option, reduce his balance and send strike back counting interests (Ma-Mb-UNa-UNb)', async () => {
        await MintPhase(scenario.amountToMint)
        await mockStrikeAsset.earnInterest(waPodPut.address)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)
        await mockStrikeAsset.earnInterest(waPodPut.address)
        await expect(waPodPut.connect(seller).unwind(scenario.amountToMint))

        const initialContractUnderlyingBalance = await waPodPut.underlyingBalance()

        await expect(waPodPut.connect(buyer).unwind(scenario.amountToMint))

        const finalBuyerOptionBalance = await waPodPut.balanceOf(sellerAddress)
        const finalBuyerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractStrikeBalance = await waPodPut.strikeBalance()
        const finalContractOptionSupply = await waPodPut.totalSupply()
        const finalContractUnderlyingBalance = await waPodPut.underlyingBalance()

        expect(finalBuyerOptionBalance).to.equal(0)
        expect(finalBuyerStrikeBalance).to.gte(scenario.strikePrice) // earned interests
        expect(finalContractStrikeBalance).to.equal(0)
        expect(finalContractOptionSupply).to.equal(0)
        expect(finalContractUnderlyingBalance).to.equal(initialContractUnderlyingBalance)
      })
      it('should revert if user try to unwind after expiration', async () => {
        await forceExpiration(waPodPut)
        await expect(waPodPut.connect(seller).unwind()).to.be.revertedWith('Option has not expired yet')
      })
    })

    describe('Withdrawing options', () => {
      it('should revert if user try to withdraw before expiration', async () => {
        await expect(waPodPut.connect(seller).withdraw()).to.be.revertedWith('Option has not expired yet')
      })

      it('should revert if user try to withdraw without balance after expiration', async () => {
        // Set Expiration
        await forceExpiration(waPodPut)
        await expect(waPodPut.connect(seller).withdraw()).to.be.revertedWith('You do not have balance to withdraw')
      })

      it('should withdraw Strike Asset balance plus interest earned', async () => {
        await MintPhase(scenario.amountToMint)
        // Earned 10% interest
        await mockStrikeAsset.earnInterest(waPodPut.address)
        const earnedInterest = scenario.strikePrice.div(ethers.BigNumber.from('100'))
        // Set Expiration
        const initialSellerOptionBalance = await waPodPut.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialContractStrikeBalance = await waPodPut.strikeBalance()

        expect(initialSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialSellerStrikeBalance).to.equal(0)
        expect(initialContractStrikeBalance).to.equal(scenario.strikePrice.add(earnedInterest))

        await forceExpiration(waPodPut)

        await waPodPut.connect(seller).withdraw()

        const finalSellerOptionBalance = await waPodPut.balanceOf(sellerAddress)
        const finalSellerStrikegBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractStrikeBalance = await waPodPut.strikeBalance()

        expect(finalSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(finalSellerStrikegBalance).to.equal(scenario.strikePrice.add(earnedInterest))
        expect(finalContractStrikeBalance).to.equal(0)
        // Cant withdraw two times in a row
        // await expect(aPodPut.connect(seller).withdraw()).to.be.revertedWith('You do not have balance to withdraw')
      })

      it('should withdraw Strike Asset balance plus interest earned proportional (Ma-Mb-Wa-Wb)', async () => {
        // seller 1
        await MintPhase(scenario.amountToMint)

        await mockStrikeAsset.earnInterest(waPodPut.address)

        // seller 1
        const twoTimesAmountToMint = scenario.amountToMint.mul(ethers.BigNumber.from('2'))
        const twoTimesAmountOfCollateral = scenario.strikePrice.mul(ethers.BigNumber.from('2'))
        await MintPhase(twoTimesAmountToMint, buyer, buyerAddress)
        const optionNumberOfDecimals = await waPodPut.decimals()
        const optionDecimals = ethers.BigNumber.from('10').pow(optionNumberOfDecimals)
        // Earned 10% interest
        await mockStrikeAsset.earnInterest(waPodPut.address)
        // Set Expiration
        const initialSellerOptionBalance = await waPodPut.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialContractStrikeBalance = await waPodPut.strikeBalance()

        expect(initialSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialSellerStrikeBalance).to.equal(0)
        expect(initialContractStrikeBalance).to.gt(twoTimesAmountOfCollateral)

        await forceExpiration(waPodPut)

        await waPodPut.connect(seller).withdraw()

        const finalSellerOptionBalance = await waPodPut.balanceOf(sellerAddress)
        const finalSellerStrikegBalance = await mockStrikeAsset.balanceOf(sellerAddress)

        expect(finalSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(finalSellerStrikegBalance).to.gt(scenario.strikePrice)
        expect(finalSellerStrikegBalance).to.lt(scenario.strikePrice.mul(twoTimesAmountToMint).div(optionDecimals))
        // Cant withdraw two times in a row
        await expect(waPodPut.connect(seller).withdraw()).to.be.revertedWith('You do not have balance to withdraw')

        await waPodPut.connect(buyer).withdraw()

        const finalBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)
        const finalContractStrikeBalance = await waPodPut.strikeBalance()

        expect(finalBuyerStrikeBalance).to.gt(scenario.strikePrice.mul(twoTimesAmountToMint).div(optionDecimals))
        expect(finalContractStrikeBalance).to.equal(0)
        await expect(waPodPut.connect(buyer).withdraw()).to.be.revertedWith('You do not have balance to withdraw')
      })

      it('should withdraw mixed amount of Strike Asset and Underlying Asset (Ma-Mb-Ec-Wa-Wb)', async () => {
        // Ma => Mint with user A (seller)
        await MintPhase(scenario.amountToMint)
        await mockStrikeAsset.earnInterest(waPodPut.address)
        const halfAmountMint = ethers.BigNumber.from(scenario.amountToMint).div(2)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)
        await mockStrikeAsset.earnInterest(waPodPut.address)
        await ExercisePhase(halfAmountMint, seller, another, anotherAddress)

        const optionNumberOfDecimals = await waPodPut.decimals()
        const optionDecimals = ethers.BigNumber.from('10').pow(optionNumberOfDecimals)

        // Checking balance before withdraw
        const initialSellerUnderlyingBalance = await ethers.provider.getBalance(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)

        await forceExpiration(waPodPut)
        const txWithdraw = await waPodPut.connect(seller).withdraw()
        const txCost = await getTxCost(txWithdraw)
        await expect(waPodPut.connect(seller).withdraw()).to.be.revertedWith('You do not have balance to withdraw')

        const finalSellerUnderlyingBalance = await ethers.provider.getBalance(sellerAddress)
        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)

        const earnedSellerStrike = finalSellerStrikeBalance.sub(initialSellerStrikeBalance)
        const earnedSellerUnderlying = finalSellerUnderlyingBalance.sub(initialSellerUnderlyingBalance).add(txCost)
        const earnedSellerInUnitsOfStrike = earnedSellerUnderlying.mul(scenario.strikePrice).div(optionDecimals)
        const totalEarned = earnedSellerStrike.add(earnedSellerInUnitsOfStrike)

        const initialSellerStriked = await waPodPut.strikeToTransfer(scenario.amountToMint)

        expect(totalEarned).to.gte(initialSellerStriked)

        const initialBuyerUnderlyingBalance = await ethers.provider.getBalance(buyerAddress)
        const initialBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)

        const txWithdrawBuyer = await waPodPut.connect(buyer).withdraw()
        const txCostBuyer = await getTxCost(txWithdrawBuyer)
        await expect(waPodPut.connect(buyer).withdraw()).to.be.revertedWith('You do not have balance to withdraw')

        const finalBuyerUnderlyingBalance = await ethers.provider.getBalance(buyerAddress)
        const finalBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)

        const earnedBuyerStrike = finalBuyerStrikeBalance.sub(initialBuyerStrikeBalance)
        const earnedBuyerUnderlying = finalBuyerUnderlyingBalance.sub(initialBuyerUnderlyingBalance).add(txCostBuyer)
        const earnedBuyerInUnitsOfStrike = earnedBuyerUnderlying.mul(scenario.strikePrice).div(optionDecimals)
        const totalEarnedBuyer = earnedBuyerStrike.add(earnedBuyerInUnitsOfStrike)

        const initialBuyerStriked = await waPodPut.strikeToTransfer(scenario.amountToMint)

        expect(totalEarnedBuyer).to.gte(initialBuyerStriked)
      })
    })
  })
})
