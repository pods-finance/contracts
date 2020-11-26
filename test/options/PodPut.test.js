const { expect } = require('chai')
const getTimestamp = require('../util/getTimestamp')
const forceExpiration = require('../util/forceExpiration')
const forceEndOfExerciseWindow = require('../util/forceEndOfExerciseWindow')
const createOptionFactory = require('../util/createOptionFactory')
const { takeSnapshot, revertToSnapshot } = require('../util/snapshot')

const OPTION_TYPE_PUT = 0 // European

const scenarios = [
  {
    name: 'WBTC/aUSDC',
    underlyingAssetSymbol: 'WBTC',
    underlyingAssetDecimals: 8,
    strikeAssetSymbol: 'aUSDC',
    strikeAssetDecimals: 6,
    strikePrice: ethers.BigNumber.from(7000e6.toString()),
    amountToMint: ethers.BigNumber.from(1e8.toString()),
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
  describe('PodPut.sol - ' + scenario.name, () => {
    let mockWETH
    let mockUnderlyingAsset
    let mockStrikeAsset
    let factoryContract
    let podPut
    let deployer
    let deployerAddress
    let seller
    let another
    let anotherAddress
    let sellerAddress
    let buyer
    let buyerAddress
    let txIdNewOption
    let snapshot
    let snapshotId

    before(async function () {
      [deployer, seller, buyer, another] = await ethers.getSigners()
      deployerAddress = await deployer.getAddress()
      sellerAddress = await seller.getAddress()
      buyerAddress = await buyer.getAddress()
      anotherAddress = await another.getAddress()
      // 1) Deploy Factory
    })

    beforeEach(async function () {
      snapshot = await takeSnapshot()
      snapshotId = snapshot.result

      const MockInterestBearingERC20 = await ethers.getContractFactory('MintableInterestBearing')
      const MockERC20 = await ethers.getContractFactory('MintableERC20')
      const MockWETHContract = await ethers.getContractFactory('WETH')
      const ContractFactory = await ethers.getContractFactory('OptionFactory')

      mockWETH = await MockWETHContract.deploy()
      mockUnderlyingAsset = await MockERC20.deploy(scenario.underlyingAssetSymbol, scenario.underlyingAssetSymbol, scenario.underlyingAssetDecimals)
      mockStrikeAsset = await MockInterestBearingERC20.deploy(scenario.strikeAssetSymbol, scenario.strikeAssetSymbol, scenario.strikeAssetDecimals)

      await mockUnderlyingAsset.deployed()
      await mockStrikeAsset.deployed()
      factoryContract = await createOptionFactory(mockWETH.address)

      txIdNewOption = await factoryContract.createOption(
        scenario.name,
        scenario.name,
        mockUnderlyingAsset.address,
        mockStrikeAsset.address,
        scenario.strikePrice,
        await getTimestamp() + 24 * 60 * 60 * 7,
        24 * 60 * 60 // 24h
      )

      const filterFrom = await factoryContract.filters.OptionCreated(deployerAddress)
      const eventDetails = await factoryContract.queryFilter(filterFrom, txIdNewOption.blockNumber, txIdNewOption.blockNumber)

      if (eventDetails.length) {
        const { option } = eventDetails[0].args
        podPut = await ethers.getContractAt('PodPut', option)
      } else {
        console.log('Something went wrong: No events found')
      }

      await podPut.deployed()
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
      await mockStrikeAsset.connect(signer).mint(scenario.strikePrice.mul(amountOfOptionsToMint).div(10 ** optionsDecimals))

      expect(await mockStrikeAsset.balanceOf(signerAddress)).to.equal(scenario.strikePrice.mul(amountOfOptionsToMint).div(10 ** optionsDecimals))
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

      it('should have equal number of decimals podPut and underlyingAsset', async () => {
        expect(await podPut.decimals()).to.equal(scenario.underlyingAssetDecimals)
      })

      it('should have equal number of decimals StrikePrice and strikeAsset', async () => {
        expect(await podPut.strikePriceDecimals()).to.equal(await podPut.strikeAssetDecimals())
      })
    })

    describe('Minting options', () => {
      it('should revert if user dont have enough collateral', async () => {
        expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(podPut.address, ethers.constants.MaxUint256)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)
        await expect(podPut.connect(seller).mint(scenario.amountToMint, sellerAddress)).to.be.revertedWith('ERC20: transfer amount exceeds balance')
      })

      it('should revert if user do not approve collateral to be spended by podPut', async () => {
        expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)

        await expect(podPut.connect(seller).mint(scenario.amountToMint, sellerAddress)).to.be.revertedWith('ERC20: transfer amount exceeds allowance')
      })

      it('should revert if asked amount is too low', async () => {
        const minimumAmount = ethers.BigNumber.from(scenario.strikePrice).div((10 ** await mockUnderlyingAsset.decimals()).toString())

        if (minimumAmount.gt(0)) return

        expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(podPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)
        await expect(podPut.connect(seller).mint(scenario.amountToMintTooLow, sellerAddress)).to.be.revertedWith('Amount too low')
      })

      it('should mint, increase senders option balance and decrease sender strike balance', async () => {
        expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(podPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)
        await podPut.connect(seller).mint(scenario.amountToMint, sellerAddress)
        expect(await podPut.balanceOf(sellerAddress)).to.equal(scenario.amountToMint)
        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)
      })
      it('should increase contract balance after time passed', async () => {
        expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(podPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)
        await podPut.connect(seller).mint(scenario.amountToMint, sellerAddress)
        expect(await podPut.balanceOf(sellerAddress)).to.equal(scenario.amountToMint)
        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)
        const strikeBalanceBefore = await podPut.connect(seller).strikeBalance()
        await mockStrikeAsset.connect(seller).earnInterest(podPut.address)
        expect(await podPut.connect(seller).strikeBalance()).to.gte(strikeBalanceBefore)
      })
      it('should revert if user try to mint after expiration', async () => {
        expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(podPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)
        await forceExpiration(podPut)
        await expect(podPut.connect(seller).mint(scenario.amountToMint, sellerAddress)).to.be.revertedWith('Option has expired')
      })
    })

    describe('Exercising options', () => {
      it('should revert if user try to exercise before expiration', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await podPut.connect(seller).transfer(buyerAddress, scenario.amountToMint)
        // Mint Underlying Asset
        await mockUnderlyingAsset.connect(buyer).mint(scenario.amountToMint)
        expect(await mockUnderlyingAsset.balanceOf(buyerAddress)).to.equal(scenario.amountToMint)
        await expect(podPut.connect(seller).exercise(scenario.amountToMint)).to.be.revertedWith('Option has not expired yet')
      })
      it('should revert if user have underlying approved, but dont have enough options', async () => {
        // Mint underlying
        await mockUnderlyingAsset.connect(buyer).mint(scenario.amountToMint)
        // Approve PodPut spend underlying asset
        await mockUnderlyingAsset.connect(buyer).approve(podPut.address, ethers.constants.MaxUint256)
        expect(await mockUnderlyingAsset.balanceOf(buyerAddress)).to.equal(scenario.amountToMint)
        await forceExpiration(podPut)
        await expect(podPut.connect(buyer).exercise(scenario.amountToMint)).to.be.revertedWith('ERC20: burn amount exceeds balance')
      })

      it('should revert if sender not have enough strike balance', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await podPut.connect(seller).transfer(buyerAddress, scenario.amountToMint)
        expect(await podPut.balanceOf(buyerAddress)).to.equal(scenario.amountToMint)
        // Approve PodPut spend underlying asset
        await mockUnderlyingAsset.connect(buyer).approve(podPut.address, ethers.constants.MaxUint256)
        await forceExpiration(podPut)
        await expect(podPut.connect(buyer).exercise(scenario.amountToMint)).to.be.revertedWith('ERC20: transfer amount exceeds balance')
      })

      it('should revert if not approved strike balance', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await podPut.connect(seller).transfer(buyerAddress, scenario.amountToMint)
        expect(await podPut.balanceOf(buyerAddress)).to.equal(scenario.amountToMint)
        // Mint Underlying Asset
        await mockUnderlyingAsset.connect(buyer).mint(scenario.amountToMint)
        expect(await mockUnderlyingAsset.balanceOf(buyerAddress)).to.equal(scenario.amountToMint)
        await forceExpiration(podPut)
        await expect(podPut.connect(buyer).exercise(scenario.amountToMint)).to.be.revertedWith('ERC20: transfer amount exceeds allowance')
      })

      it('should exercise and have all final balances matched', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await podPut.connect(seller).transfer(buyerAddress, scenario.amountToMint)

        // Mint Underlying Asset
        await mockUnderlyingAsset.connect(buyer).mint(scenario.amountToMint)
        // Approve Underlying to be spent by contract
        await mockUnderlyingAsset.connect(buyer).approve(podPut.address, ethers.constants.MaxUint256)

        const initialBuyerOptionBalance = await podPut.balanceOf(buyerAddress)
        const initialBuyerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(buyerAddress)
        const initialContractUnderlyingBalance = await podPut.underlyingBalance()
        const initialContractStrikeBalance = await podPut.strikeBalance()
        const initialContractOptionSupply = await podPut.totalSupply()

        expect(initialBuyerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialBuyerUnderlyingBalance).to.equal(scenario.amountToMint)
        expect(initialContractUnderlyingBalance).to.equal(0)
        expect(initialContractStrikeBalance).to.equal(scenario.strikePrice)
        expect(initialContractOptionSupply).to.equal(scenario.amountToMint)

        await forceExpiration(podPut)
        await expect(podPut.connect(buyer).exercise(scenario.amountToMint))

        const finalBuyerOptionBalance = await podPut.balanceOf(buyerAddress)
        const finalBuyerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(buyerAddress)
        const finalContractUnderlyingBalance = await podPut.underlyingBalance()
        const finalContractStrikeBalance = await podPut.strikeBalance()
        const finalContractOptionSupply = await podPut.totalSupply()

        expect(finalBuyerOptionBalance).to.equal(0)
        expect(finalBuyerUnderlyingBalance).to.equal(0)
        expect(finalContractUnderlyingBalance).to.equal(scenario.amountToMint)
        expect(finalContractStrikeBalance).to.equal(0)
        expect(finalContractOptionSupply).to.equal(0)
      })
      it('should revert if user try to exercise after exercise window', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await podPut.connect(seller).transfer(buyerAddress, scenario.amountToMint)
        // Mint Underlying Asset
        await mockUnderlyingAsset.connect(buyer).mint(scenario.amountToMint)
        expect(await mockUnderlyingAsset.balanceOf(buyerAddress)).to.equal(scenario.amountToMint)
        await forceEndOfExerciseWindow(podPut)
        await expect(podPut.connect(seller).exercise(scenario.amountToMint)).to.be.reverted
      })
    })

    describe('unminting options', () => {
      it('should revert if try to unmint without amount', async () => {
        await expect(podPut.connect(seller).unmint(scenario.amountToMint)).to.be.revertedWith('You do not have minted options')
      })
      it('should revert if try to unmint amount higher than possible', async () => {
        await MintPhase(scenario.amountToMint)
        await expect(podPut.connect(seller).unmint(2 * scenario.amountToMint)).to.be.revertedWith('Exceed address minted options')
      })
      it('should revert if unmint amount is too low', async () => {
        const minimumAmount = ethers.BigNumber.from(scenario.strikePrice).div((10 ** await mockUnderlyingAsset.decimals()).toString())
        if (minimumAmount.gt(0)) return
        await MintPhase(scenario.amountToMint)
        await expect(podPut.connect(seller).unmint(scenario.amountToMintTooLow, sellerAddress)).to.be.revertedWith('Amount too low')
      })
      it('should unmint, destroy sender option, reduce his balance and send strike back', async () => {
        await MintPhase(scenario.amountToMint)
        const initialSellerOptionBalance = await podPut.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialContractUnderlyingBalance = await podPut.underlyingBalance()
        const initialContractStrikeBalance = await podPut.strikeBalance()
        const initialContractOptionSupply = await podPut.totalSupply()

        expect(initialSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialSellerStrikeBalance).to.equal(0)
        expect(initialContractUnderlyingBalance).to.equal(0)
        expect(initialContractStrikeBalance).to.equal(scenario.strikePrice)
        expect(initialContractOptionSupply).to.equal(scenario.amountToMint)
        await expect(podPut.connect(seller).unmint(scenario.amountToMint))

        const finalSellerOptionBalance = await podPut.balanceOf(sellerAddress)
        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractUnderlyingBalance = await podPut.underlyingBalance()
        const finalContractStrikeBalance = await podPut.strikeBalance()
        const finalContractOptionSupply = await podPut.totalSupply()

        expect(finalSellerOptionBalance).to.equal(0)
        expect(finalSellerStrikeBalance).to.equal(scenario.strikePrice)
        expect(finalContractStrikeBalance).to.equal(0)
        expect(finalContractOptionSupply).to.equal(0)
        expect(finalContractUnderlyingBalance).to.equal(0)
      })
      it('should unmint, destroy seller option, reduce his balance and send strike back counting interests (Ma-Mb-UNa)', async () => {
        await MintPhase(scenario.amountToMint)
        await mockStrikeAsset.earnInterest(podPut.address)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)
        await mockStrikeAsset.earnInterest(podPut.address)

        const initialSellerOptionBalance = await podPut.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialContractUnderlyingBalance = await podPut.underlyingBalance()
        const initialContractStrikeBalance = await podPut.strikeBalance()
        const initialContractOptionSupply = await podPut.totalSupply()

        await expect(podPut.connect(seller).unmint(scenario.amountToMint))

        const finalSellerOptionBalance = await podPut.balanceOf(sellerAddress)
        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractUnderlyingBalance = await podPut.underlyingBalance()
        const finalContractStrikeBalance = await podPut.strikeBalance()
        const finalContractOptionSupply = await podPut.totalSupply()

        expect(finalSellerOptionBalance).to.equal(initialSellerOptionBalance.sub(scenario.amountToMint))
        expect(finalSellerStrikeBalance).to.gte(initialSellerStrikeBalance.add(scenario.strikePrice))
        expect(finalContractStrikeBalance).to.gte(scenario.strikePrice)
        expect(finalContractOptionSupply).to.equal(initialContractOptionSupply.sub(scenario.amountToMint))
        expect(finalContractUnderlyingBalance).to.equal(initialContractUnderlyingBalance)
      })
      it('should unmint, destroy seller option, reduce his balance and send strike back counting interests (Ma-Mb-UNa-UNb)', async () => {
        await MintPhase(scenario.amountToMint)
        await mockStrikeAsset.earnInterest(podPut.address)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)
        await mockStrikeAsset.earnInterest(podPut.address)
        await expect(podPut.connect(seller).unmint(scenario.amountToMint))

        const initialContractUnderlyingBalance = await podPut.underlyingBalance()

        await expect(podPut.connect(buyer).unmint(scenario.amountToMint))

        const finalBuyerOptionBalance = await podPut.balanceOf(sellerAddress)
        const finalBuyerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractStrikeBalance = await podPut.strikeBalance()
        const finalContractOptionSupply = await podPut.totalSupply()
        const finalContractUnderlyingBalance = await podPut.underlyingBalance()

        expect(finalBuyerOptionBalance).to.equal(0)
        expect(finalBuyerStrikeBalance).to.gte(scenario.strikePrice) // earned interests
        expect(finalContractStrikeBalance).to.equal(0)
        expect(finalContractOptionSupply).to.equal(0)
        expect(finalContractUnderlyingBalance).to.equal(initialContractUnderlyingBalance)
      })
      it('should revert if user try to unmint after expiration', async () => {
        await forceExpiration(podPut)
        await expect(podPut.connect(seller).unmint()).to.be.revertedWith('Option has not expired yet')
      })
    })

    describe('Withdrawing options', () => {
      it('should revert if user try to withdraw before expiration', async () => {
        await expect(podPut.connect(seller).withdraw()).to.be.revertedWith('Window of exercise not close yet')
      })

      it('should revert if user try to withdraw without balance after expiration', async () => {
        // Set Expiration
        await forceEndOfExerciseWindow(podPut)

        await expect(podPut.connect(seller).withdraw()).to.be.revertedWith('You do not have balance to withdraw')
      })

      it('should withdraw Strike Asset balance plus interest earned', async () => {
        await MintPhase(scenario.amountToMint)
        // Earned 10% interest
        await mockStrikeAsset.earnInterest(podPut.address)
        const earnedInterest = scenario.strikePrice.div(ethers.BigNumber.from('100'))
        // Set Expiration
        const initialSellerOptionBalance = await podPut.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialContractStrikeBalance = await podPut.strikeBalance()

        expect(initialSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialSellerStrikeBalance).to.equal(0)
        expect(initialContractStrikeBalance).to.equal(scenario.strikePrice.add(earnedInterest))

        await forceEndOfExerciseWindow(podPut)
        await podPut.connect(seller).withdraw()

        const finalSellerOptionBalance = await podPut.balanceOf(sellerAddress)
        const finalSellerStrikegBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractStrikeBalance = await podPut.strikeBalance()

        expect(finalSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(finalSellerStrikegBalance).to.equal(scenario.strikePrice.add(earnedInterest))
        expect(finalContractStrikeBalance).to.equal(0)
        // Cant withdraw two times in a row
        // await expect(podPut.connect(seller).withdraw()).to.be.revertedWith('You do not have balance to withdraw')
      })

      it('should withdraw Strike Asset balance plus interest earned proportional (Ma-Mb-Wa-Wb)', async () => {
        // seller 1
        await MintPhase(scenario.amountToMint)

        await mockStrikeAsset.earnInterest(podPut.address)

        // seller 1
        const twoTimesAmountToMint = scenario.amountToMint.mul(ethers.BigNumber.from('2'))
        await MintPhase(twoTimesAmountToMint, buyer, buyerAddress)
        const optionDecimals = await podPut.decimals()

        // Earned 10% interest
        await mockStrikeAsset.earnInterest(podPut.address)
        // Set Expiration
        const initialSellerOptionBalance = await podPut.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialContractStrikeBalance = await podPut.strikeBalance()

        expect(initialSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialSellerStrikeBalance).to.equal(0)
        expect(initialContractStrikeBalance).to.gt(scenario.strikePrice.add(twoTimesAmountToMint))

        await forceEndOfExerciseWindow(podPut)
        await podPut.connect(seller).withdraw()

        const finalSellerOptionBalance = await podPut.balanceOf(sellerAddress)
        const finalSellerStrikegBalance = await mockStrikeAsset.balanceOf(sellerAddress)

        expect(finalSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(finalSellerStrikegBalance).to.gt(scenario.strikePrice)
        expect(finalSellerStrikegBalance).to.lt(scenario.strikePrice.mul(twoTimesAmountToMint).div(10 ** optionDecimals))
        // Cant withdraw two times in a row
        await expect(podPut.connect(seller).withdraw()).to.be.revertedWith('You do not have balance to withdraw')

        await podPut.connect(buyer).withdraw()

        const finalBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)
        const finalContractStrikeBalance = await podPut.strikeBalance()

        expect(finalBuyerStrikeBalance).to.gt(scenario.strikePrice.mul(twoTimesAmountToMint).div(10 ** optionDecimals))
        expect(finalContractStrikeBalance).to.equal(0)

        await expect(podPut.connect(buyer).withdraw()).to.be.revertedWith('You do not have balance to withdraw')
      })

      it('should withdraw mixed amount of Strike Asset and Underlying Asset (Ma-Mb-Ec-Wa-Wb)', async () => {
        // Ma => Mint with user A (seller)
        await MintPhase(scenario.amountToMint)
        await mockStrikeAsset.earnInterest(podPut.address)
        const halfAmountMint = ethers.BigNumber.from(scenario.amountToMint).div(2)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)
        await mockStrikeAsset.earnInterest(podPut.address)

        await forceExpiration(podPut)
        await ExercisePhase(halfAmountMint, seller, another, anotherAddress)

        const underlyingDecimals = await mockUnderlyingAsset.decimals()
        // Checking balance before withdraw
        const initialSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)

        await forceEndOfExerciseWindow(podPut)
        await expect(podPut.connect(seller).withdraw())
        await expect(podPut.connect(seller).withdraw()).to.be.revertedWith('You do not have balance to withdraw')

        const finalSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)

        const earnedSellerStrike = finalSellerStrikeBalance.sub(initialSellerStrikeBalance)
        const earnedSellerUnderlying = finalSellerUnderlyingBalance.sub(initialSellerUnderlyingBalance)
        const earnedSellerInUnitsOfStrike = earnedSellerUnderlying.mul(scenario.strikePrice).div(10 ** underlyingDecimals)
        const totalEarned = earnedSellerStrike.add(earnedSellerInUnitsOfStrike)

        const initialSellerStriked = await podPut.strikeToTransfer(scenario.amountToMint)

        expect(totalEarned).to.gte(initialSellerStriked)

        const initialBuyerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(buyerAddress)
        const initialBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)

        await expect(podPut.connect(buyer).withdraw())
        await expect(podPut.connect(buyer).withdraw()).to.be.revertedWith('You do not have balance to withdraw')

        const finalBuyerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(buyerAddress)
        const finalBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)

        const earnedBuyerStrike = finalBuyerStrikeBalance.sub(initialBuyerStrikeBalance)
        const earnedBuyerUnderlying = finalBuyerUnderlyingBalance.sub(initialBuyerUnderlyingBalance)
        const earnedBuyerInUnitsOfStrike = earnedBuyerUnderlying.mul(scenario.strikePrice).div(10 ** underlyingDecimals)
        const totalEarnedBuyer = earnedBuyerStrike.add(earnedBuyerInUnitsOfStrike)

        const initialBuyerStriked = await podPut.strikeToTransfer(scenario.amountToMint)

        expect(totalEarnedBuyer).to.gte(initialBuyerStriked)
      })
    })
  })
})
