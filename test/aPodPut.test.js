const { expect } = require('chai')

const OPTION_TYPE_PUT = 0

const scenarios = [
  {
    name: 'WBTC/aUSDC',
    underlyingAssetSymbol: 'WBTC',
    underlyingAssetDecimals: 8,
    strikeAssetSymbol: 'aUSDC',
    strikeAssetDecimals: 6,
    strikePrice: ethers.BigNumber.from(7000e6.toString()),
    expirationDate: 900000,
    amountToMint: ethers.BigNumber.from(1e8.toString()),
    amountToMintTooLow: 1
  }
  // {
  //   name: 'WBTC/aDAI',
  //   underlyingAssetSymbol: 'WETH',
  //   underlyingAssetDecimals: 18,
  //   strikeAssetSymbol: 'USDC',
  //   strikeAssetDecimals: 6,
  //   strikePrice: ethers.BigNumber.from(300e6.toString()),
  //   strikePriceDecimals: 6,
  //   expirationDate: 900000,
  //   amountToMint: ethers.BigNumber.from(1e18.toString()),
  //   amountToMintTooLow: 1
  // }
  // {
  //   name: 'ETH/aUSDC',
  //   underlyingAssetSymbol: 'WETH',
  //   underlyingAssetDecimals: 18,
  //   strikeAssetSymbol: 'USDC',
  //   strikeAssetDecimals: 6,
  //   strikePrice: ethers.BigNumber.from(300e6.toString()),
  //   strikePriceDecimals: 6,
  //   expirationDate: 900000,
  //   amountToMint: ethers.BigNumber.from(1e18.toString()),
  //   amountToMintTooLow: 1
  // },
  // {
  //   name: 'ETH/aDAI',
  //   underlyingAssetSymbol: 'WETH',
  //   underlyingAssetDecimals: 18,
  //   strikeAssetSymbol: 'DAI',
  //   strikeAssetDecimals: 18,
  //   strikePrice: ethers.BigNumber.from(300e6.toString()),
  //   strikePriceDecimals: 6,
  //   expirationDate: 900000,
  //   amountToMint: ethers.BigNumber.from(1e18.toString()),
  //   amountToMintTooLow: 1
  // }
]
scenarios.forEach(scenario => {
  describe('aPodPut.sol - ' + scenario.name, () => {
    let mockUnderlyingAsset
    let mockStrikeAsset
    let factoryContract
    let aPodPut
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
      const ContractFactory = await ethers.getContractFactory('BearingOptionFactory')
      factoryContract = await ContractFactory.deploy()
      await factoryContract.deployed()
    })

    beforeEach(async function () {
      // const aPodPut = await ethers.getContractFactory('aPodPut')
      const MockInterestBearingERC20 = await ethers.getContractFactory('MintableInterestBearing')
      const MockERC20 = await ethers.getContractFactory('MintableERC20')

      mockUnderlyingAsset = await MockERC20.deploy(scenario.underlyingAssetSymbol, scenario.underlyingAssetSymbol, scenario.underlyingAssetDecimals)
      mockStrikeAsset = await MockInterestBearingERC20.deploy(scenario.strikeAssetSymbol, scenario.strikeAssetSymbol, scenario.strikeAssetDecimals)

      await mockUnderlyingAsset.deployed()
      await mockStrikeAsset.deployed()

      // call transaction
      txIdNewOption = await factoryContract.createBearingOption(
        scenario.name,
        scenario.name,
        OPTION_TYPE_PUT,
        mockUnderlyingAsset.address,
        mockStrikeAsset.address,
        scenario.strikePrice,
        await ethers.provider.getBlockNumber() + 300 // expirationDate = high block number
      )

      const filterFrom = await factoryContract.filters.OptionCreated(deployerAddress)
      const eventDetails = await factoryContract.queryFilter(filterFrom, txIdNewOption.blockNumber, txIdNewOption.blockNumber)

      if (eventDetails.length) {
        const { option } = eventDetails[0].args
        aPodPut = await ethers.getContractAt('aPodPut', option)
      } else {
        console.log('Something went wrong: No events found')
      }

      await aPodPut.deployed()
    })

    async function MintPhase (amountOfOptionsToMint, signer = seller, owner = sellerAddress) {
      const signerAddress = await signer.getAddress()
      expect(await aPodPut.balanceOf(signerAddress)).to.equal(0)
      const optionsDecimals = await aPodPut.decimals()
      await mockStrikeAsset.connect(signer).approve(aPodPut.address, ethers.constants.MaxUint256)
      // calculate amount of Strike necessary to mint
      await mockStrikeAsset.connect(signer).mint(scenario.strikePrice.mul(amountOfOptionsToMint).div(10 ** optionsDecimals))

      expect(await mockStrikeAsset.balanceOf(signerAddress)).to.equal(scenario.strikePrice.mul(amountOfOptionsToMint).div(10 ** optionsDecimals))
      await aPodPut.connect(signer).mint(amountOfOptionsToMint, owner)
      expect(await aPodPut.balanceOf(signerAddress)).to.equal(amountOfOptionsToMint)
      expect(await mockStrikeAsset.balanceOf(signerAddress)).to.equal(0)
    }

    async function ExercisePhase (amountOfOptionsToExercise, signer = seller, receiver = buyer, receiverAddress = buyerAddress) {
      await aPodPut.connect(signer).transfer(receiverAddress, amountOfOptionsToExercise)
      await mockUnderlyingAsset.connect(receiver).mint(scenario.amountToMint)
      await mockUnderlyingAsset.connect(receiver).approve(aPodPut.address, ethers.constants.MaxUint256)
      await aPodPut.connect(receiver).exercise(amountOfOptionsToExercise)
    }

    async function forceExpiration (untilThisBlock) {
      let currentBlock = await ethers.provider.getBlockNumber()
      while (currentBlock <= untilThisBlock) {
        await ethers.provider.send('evm_mine')
        currentBlock++
      }
    }

    describe('Constructor/Initialization checks', () => {
      it('should have correct number of decimals for underlying and strike asset', async () => {
        expect(await aPodPut.strikeAssetDecimals()).to.equal(scenario.strikeAssetDecimals)
        expect(await aPodPut.underlyingAssetDecimals()).to.equal(scenario.underlyingAssetDecimals)
      })

      it('should have equal number of decimals aPodPut and underlyingAsset', async () => {
        expect(await aPodPut.decimals()).to.equal(scenario.underlyingAssetDecimals)
      })

      it('should have equal number of decimals StrikePrice and strikeAsset', async () => {
        expect(await aPodPut.strikePriceDecimals()).to.equal(await aPodPut.strikeAssetDecimals())
      })
    })

    describe('Minting options', () => {
      it('should revert if user dont have enough collateral', async () => {
        expect(await aPodPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(aPodPut.address, ethers.constants.MaxUint256)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)
        await expect(aPodPut.connect(seller).mint(scenario.amountToMint, sellerAddress)).to.be.revertedWith('ERC20: transfer amount exceeds balance')
      })

      it('should revert if user do not approve collateral to be spended by aPodPut', async () => {
        expect(await aPodPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)

        await expect(aPodPut.connect(seller).mint(scenario.amountToMint, sellerAddress)).to.be.revertedWith('ERC20: transfer amount exceeds allowance')
      })

      it('should revert if asked amount is too low', async () => {
        const minimumAmount = ethers.BigNumber.from(scenario.strikePrice).div((10 ** await mockUnderlyingAsset.decimals()).toString())

        if (minimumAmount.gt(0)) return

        expect(await aPodPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(aPodPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)
        await expect(aPodPut.connect(seller).mint(scenario.amountToMintTooLow, sellerAddress)).to.be.revertedWith('Amount too low')
      })

      it('should mint, increase senders option balance and decrease sender strike balance', async () => {
        expect(await aPodPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(aPodPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)
        await aPodPut.connect(seller).mint(scenario.amountToMint, sellerAddress)
        expect(await aPodPut.balanceOf(sellerAddress)).to.equal(scenario.amountToMint)
        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)
      })
      it('should increase contract balance after time passed', async () => {
        expect(await aPodPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(aPodPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)
        await aPodPut.connect(seller).mint(scenario.amountToMint, sellerAddress)
        expect(await aPodPut.balanceOf(sellerAddress)).to.equal(scenario.amountToMint)
        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)
        const strikeBalanceBefore = await aPodPut.connect(seller).strikeBalance()
        await mockStrikeAsset.connect(seller).earnInterest(aPodPut.address)
        expect(await aPodPut.connect(seller).strikeBalance()).to.gte(strikeBalanceBefore)
      })
      it('should revert if user try to mint after expiration', async () => {
        expect(await aPodPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(aPodPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)
        await forceExpiration(await aPodPut.expirationBlockNumber())
        await expect(aPodPut.connect(seller).mint(scenario.amountToMint, sellerAddress)).to.be.revertedWith('Option has expired')
      })
    })

    describe('Exercising options', () => {
      it('should revert if user have underlying approved, but dont have enough options', async () => {
        // Mint underlying
        await mockUnderlyingAsset.connect(buyer).mint(scenario.amountToMint)
        // Approve PodPut spend underlying asset
        await mockUnderlyingAsset.connect(buyer).approve(aPodPut.address, ethers.constants.MaxUint256)
        expect(await mockUnderlyingAsset.balanceOf(buyerAddress)).to.equal(scenario.amountToMint)
        await expect(aPodPut.connect(buyer).exercise(scenario.amountToMint)).to.be.revertedWith('ERC20: burn amount exceeds balance')
      })

      it('should revert if sender not have enough strike balance', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await aPodPut.connect(seller).transfer(buyerAddress, scenario.amountToMint)
        expect(await aPodPut.balanceOf(buyerAddress)).to.equal(scenario.amountToMint)
        // Approve PodPut spend underlying asset
        await mockUnderlyingAsset.connect(buyer).approve(aPodPut.address, ethers.constants.MaxUint256)
        await expect(aPodPut.connect(buyer).exercise(scenario.amountToMint)).to.be.revertedWith('ERC20: transfer amount exceeds balance')
      })

      it('should revert if not approved strike balance', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await aPodPut.connect(seller).transfer(buyerAddress, scenario.amountToMint)
        expect(await aPodPut.balanceOf(buyerAddress)).to.equal(scenario.amountToMint)
        // Mint Underlying Asset
        await mockUnderlyingAsset.connect(buyer).mint(scenario.amountToMint)
        expect(await mockUnderlyingAsset.balanceOf(buyerAddress)).to.equal(scenario.amountToMint)
        await expect(aPodPut.connect(buyer).exercise(scenario.amountToMint)).to.be.revertedWith('ERC20: transfer amount exceeds allowance')
      })

      it('should exercise and have all final balances matched', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await aPodPut.connect(seller).transfer(buyerAddress, scenario.amountToMint)

        // Mint Underlying Asset
        await mockUnderlyingAsset.connect(buyer).mint(scenario.amountToMint)
        // Approve Underlying to be spent by contract
        await mockUnderlyingAsset.connect(buyer).approve(aPodPut.address, ethers.constants.MaxUint256)

        const initialBuyerOptionBalance = await aPodPut.balanceOf(buyerAddress)
        const initialBuyerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(buyerAddress)
        const initialContractUnderlyingBalance = await aPodPut.underlyingBalance()
        const initialContractStrikeBalance = await aPodPut.strikeBalance()
        const initialContractOptionSupply = await aPodPut.totalSupply()

        expect(initialBuyerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialBuyerUnderlyingBalance).to.equal(scenario.amountToMint)
        expect(initialContractUnderlyingBalance).to.equal(0)
        expect(initialContractStrikeBalance).to.equal(scenario.strikePrice)
        expect(initialContractOptionSupply).to.equal(scenario.amountToMint)
        await expect(aPodPut.connect(buyer).exercise(scenario.amountToMint))

        const finalBuyerOptionBalance = await aPodPut.balanceOf(buyerAddress)
        const finalBuyerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(buyerAddress)
        const finalContractUnderlyingBalance = await aPodPut.underlyingBalance()
        const finalContractStrikeBalance = await aPodPut.strikeBalance()
        const finalContractOptionSupply = await aPodPut.totalSupply()

        expect(finalBuyerOptionBalance).to.equal(0)
        expect(finalBuyerUnderlyingBalance).to.equal(0)
        expect(finalContractUnderlyingBalance).to.equal(scenario.amountToMint)
        expect(finalContractStrikeBalance).to.equal(0)
        expect(finalContractOptionSupply).to.equal(0)
      })
      it('should revert if user try to exercise after expiration', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await aPodPut.connect(seller).transfer(buyerAddress, scenario.amountToMint)
        // Mint Underlying Asset
        await mockUnderlyingAsset.connect(buyer).mint(scenario.amountToMint)
        expect(await mockUnderlyingAsset.balanceOf(buyerAddress)).to.equal(scenario.amountToMint)
        await forceExpiration(await aPodPut.expirationBlockNumber())
        await expect(aPodPut.connect(seller).exercise(scenario.amountToMint)).to.be.reverted
      })
    })

    describe('Unwinding options', () => {
      it('should revert if try to unwind without amount', async () => {
        await expect(aPodPut.connect(seller).unwind(scenario.amountToMint)).to.be.revertedWith('You do not have minted options')
      })
      it('should revert if try to unwind amount higher than possible', async () => {
        await MintPhase(scenario.amountToMint)
        await expect(aPodPut.connect(seller).unwind(2 * scenario.amountToMint)).to.be.revertedWith('Exceed address minted options')
      })
      it('should unwind, destroy sender option, reduce his balance and send strike back', async () => {
        await MintPhase(scenario.amountToMint)
        const initialSellerOptionBalance = await aPodPut.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialContractUnderlyingBalance = await aPodPut.underlyingBalance()
        const initialContractStrikeBalance = await aPodPut.strikeBalance()
        const initialContractOptionSupply = await aPodPut.totalSupply()

        expect(initialSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialSellerStrikeBalance).to.equal(0)
        expect(initialContractUnderlyingBalance).to.equal(0)
        expect(initialContractStrikeBalance).to.equal(scenario.strikePrice)
        expect(initialContractOptionSupply).to.equal(scenario.amountToMint)
        await expect(aPodPut.connect(seller).unwind(scenario.amountToMint))

        const finalSellerOptionBalance = await aPodPut.balanceOf(sellerAddress)
        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractUnderlyingBalance = await aPodPut.underlyingBalance()
        const finalContractStrikeBalance = await aPodPut.strikeBalance()
        const finalContractOptionSupply = await aPodPut.totalSupply()

        expect(finalSellerOptionBalance).to.equal(0)
        expect(finalSellerStrikeBalance).to.equal(scenario.strikePrice)
        expect(finalContractStrikeBalance).to.equal(0)
        expect(finalContractOptionSupply).to.equal(0)
        expect(finalContractUnderlyingBalance).to.equal(0)
      })
      it('should unwind, destroy seller option, reduce his balance and send strike back counting interests (Ma-Mb-UNa)', async () => {
        await MintPhase(scenario.amountToMint)
        await mockStrikeAsset.earnInterest(aPodPut.address)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)
        await mockStrikeAsset.earnInterest(aPodPut.address)

        const initialSellerOptionBalance = await aPodPut.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialContractUnderlyingBalance = await aPodPut.underlyingBalance()
        const initialContractStrikeBalance = await aPodPut.strikeBalance()
        const initialContractOptionSupply = await aPodPut.totalSupply()

        await expect(aPodPut.connect(seller).unwind(scenario.amountToMint))

        const finalSellerOptionBalance = await aPodPut.balanceOf(sellerAddress)
        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractUnderlyingBalance = await aPodPut.underlyingBalance()
        const finalContractStrikeBalance = await aPodPut.strikeBalance()
        const finalContractOptionSupply = await aPodPut.totalSupply()

        expect(finalSellerOptionBalance).to.equal(initialSellerOptionBalance.sub(scenario.amountToMint))
        expect(finalSellerStrikeBalance).to.gte(initialSellerStrikeBalance.add(scenario.strikePrice))
        expect(finalContractStrikeBalance).to.gte(scenario.strikePrice)
        expect(finalContractOptionSupply).to.equal(initialContractOptionSupply - scenario.amountToMint)
        expect(finalContractUnderlyingBalance).to.equal(initialContractUnderlyingBalance)
      })
      it('should unwind, destroy seller option, reduce his balance and send strike back counting interests (Ma-Mb-UNa-UNb)', async () => {
        await MintPhase(scenario.amountToMint)
        await mockStrikeAsset.earnInterest(aPodPut.address)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)
        await mockStrikeAsset.earnInterest(aPodPut.address)
        await expect(aPodPut.connect(seller).unwind(scenario.amountToMint))

        const initialContractUnderlyingBalance = await aPodPut.underlyingBalance()

        await expect(aPodPut.connect(buyer).unwind(scenario.amountToMint))

        const finalBuyerOptionBalance = await aPodPut.balanceOf(sellerAddress)
        const finalBuyerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractStrikeBalance = await aPodPut.strikeBalance()
        const finalContractOptionSupply = await aPodPut.totalSupply()
        const finalContractUnderlyingBalance = await aPodPut.underlyingBalance()

        expect(finalBuyerOptionBalance).to.equal(0)
        expect(finalBuyerStrikeBalance).to.gte(scenario.strikePrice) // earned interests
        expect(finalContractStrikeBalance).to.equal(0)
        expect(finalContractOptionSupply).to.equal(0)
        expect(finalContractUnderlyingBalance).to.equal(initialContractUnderlyingBalance)
      })
      it('should revert if user try to unwind after expiration', async () => {
        await forceExpiration(await aPodPut.expirationBlockNumber())
        await expect(aPodPut.connect(seller).unwind()).to.be.revertedWith('Option has not expired yet')
      })
    })

    describe('Withdrawing options', () => {
      it('should revert if user try to withdraw before expiration', async () => {
        await expect(aPodPut.connect(seller).withdraw()).to.be.revertedWith('Option has not expired yet')
      })

      it('should revert if user try to withdraw without balance after expiration', async () => {
        // Set Expiration
        const optionExpiration = await aPodPut.expirationBlockNumber()
        await forceExpiration(optionExpiration)

        await expect(aPodPut.connect(seller).withdraw()).to.be.revertedWith('You do not have balance to withdraw')
      })

      it('should withdraw Strike Asset balance plus interest earned', async () => {
        await MintPhase(scenario.amountToMint)
        // Earned 10% interest
        await mockStrikeAsset.earnInterest(aPodPut.address)
        const earnedInterest = scenario.strikePrice.div(ethers.BigNumber.from('100'))
        // Set Expiration
        const initialSellerOptionBalance = await aPodPut.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialContractStrikeBalance = await aPodPut.strikeBalance()

        expect(initialSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialSellerStrikeBalance).to.equal(0)
        expect(initialContractStrikeBalance).to.equal(scenario.strikePrice.add(earnedInterest))

        const optionExpiration = await aPodPut.expirationBlockNumber()
        await forceExpiration(optionExpiration)

        await aPodPut.connect(seller).withdraw()

        const finalSellerOptionBalance = await aPodPut.balanceOf(sellerAddress)
        const finalSellerStrikegBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractStrikeBalance = await aPodPut.strikeBalance()

        expect(finalSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(finalSellerStrikegBalance).to.equal(scenario.strikePrice.add(earnedInterest))
        expect(finalContractStrikeBalance).to.equal(0)
        // Cant withdraw two times in a row
        // await expect(aPodPut.connect(seller).withdraw()).to.be.revertedWith('You do not have balance to withdraw')
      })

      it('should withdraw Strike Asset balance plus interest earned proportional (Ma-Mb-Wa-Wb)', async () => {
        // seller 1
        await MintPhase(scenario.amountToMint)

        await mockStrikeAsset.earnInterest(aPodPut.address)

        // seller 1
        const twoTimesAmountToMint = scenario.amountToMint.mul(ethers.BigNumber.from('2'))
        await MintPhase(twoTimesAmountToMint, buyer, buyerAddress)
        const optionDecimals = await aPodPut.decimals()

        // Earned 10% interest
        await mockStrikeAsset.earnInterest(aPodPut.address)
        // Set Expiration
        const initialSellerOptionBalance = await aPodPut.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialContractStrikeBalance = await aPodPut.strikeBalance()

        expect(initialSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialSellerStrikeBalance).to.equal(0)
        expect(initialContractStrikeBalance).to.gt(scenario.strikePrice.add(twoTimesAmountToMint))

        const optionExpiration = await aPodPut.expirationBlockNumber()
        await forceExpiration(optionExpiration)

        await aPodPut.connect(seller).withdraw()

        const finalSellerOptionBalance = await aPodPut.balanceOf(sellerAddress)
        const finalSellerStrikegBalance = await mockStrikeAsset.balanceOf(sellerAddress)

        expect(finalSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(finalSellerStrikegBalance).to.gt(scenario.strikePrice)
        expect(finalSellerStrikegBalance).to.lt(scenario.strikePrice.mul(twoTimesAmountToMint).div(10 ** optionDecimals))
        // Cant withdraw two times in a row
        await expect(aPodPut.connect(seller).withdraw()).to.be.revertedWith('You do not have balance to withdraw')

        await aPodPut.connect(buyer).withdraw()

        const finalBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)
        const finalContractStrikeBalance = await aPodPut.strikeBalance()

        expect(finalBuyerStrikeBalance).to.gt(scenario.strikePrice.mul(twoTimesAmountToMint).div(10 ** optionDecimals))
        expect(finalContractStrikeBalance).to.equal(0)
        await expect(aPodPut.connect(buyer).withdraw()).to.be.revertedWith('You do not have balance to withdraw')
      })

      it('should withdraw mixed amount of Strike Asset and Underlying Asset (Ma-Mb-Ec-Wa-Wb)', async () => {
        // Ma => Mint with user A (seller)
        await MintPhase(scenario.amountToMint)
        await mockStrikeAsset.earnInterest(aPodPut.address)
        const halfAmountMint = ethers.BigNumber.from(scenario.amountToMint).div(2)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)
        await mockStrikeAsset.earnInterest(aPodPut.address)
        await ExercisePhase(halfAmountMint, seller, another, anotherAddress)

        const optionExpiration = await aPodPut.expirationBlockNumber()
        await forceExpiration(optionExpiration)

        const underlyingDecimals = await mockUnderlyingAsset.decimals()
        // Checking balance before withdraw
        const initialSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)

        await expect(aPodPut.connect(seller).withdraw())
        await expect(aPodPut.connect(seller).withdraw()).to.be.revertedWith('You do not have balance to withdraw')

        const finalSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)

        const earnedSellerStrike = finalSellerStrikeBalance.sub(initialSellerStrikeBalance)
        const earnedSellerUnderlying = finalSellerUnderlyingBalance.sub(initialSellerUnderlyingBalance)
        const earnedSellerInUnitsOfStrike = earnedSellerUnderlying.mul(scenario.strikePrice).div(10 ** underlyingDecimals)
        const totalEarned = earnedSellerStrike.add(earnedSellerInUnitsOfStrike)

        const initialSellerStriked = await aPodPut.strikeToTransfer(scenario.amountToMint)

        expect(totalEarned).to.gte(initialSellerStriked)

        const initialBuyerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(buyerAddress)
        const initialBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)

        await expect(aPodPut.connect(buyer).withdraw())
        await expect(aPodPut.connect(buyer).withdraw()).to.be.revertedWith('You do not have balance to withdraw')

        const finalBuyerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(buyerAddress)
        const finalBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)

        const earnedBuyerStrike = finalBuyerStrikeBalance.sub(initialBuyerStrikeBalance)
        const earnedBuyerUnderlying = finalBuyerUnderlyingBalance.sub(initialBuyerUnderlyingBalance)
        const earnedBuyerInUnitsOfStrike = earnedBuyerUnderlying.mul(scenario.strikePrice).div(10 ** underlyingDecimals)
        const totalEarnedBuyer = earnedBuyerStrike.add(earnedBuyerInUnitsOfStrike)

        const initialBuyerStriked = await aPodPut.strikeToTransfer(scenario.amountToMint)

        expect(totalEarnedBuyer).to.gte(initialBuyerStriked)
      })
    })
  })
})
