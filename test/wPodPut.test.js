const { expect } = require('chai')
const forceExpiration = require('./util/forceExpiration')
const getTxCost = require('./util/getTxCost')

const OPTION_TYPE_PUT = 0

const scenarios = [
  {
    name: 'ETH/USDC',
    underlyingAssetSymbol: 'WETH',
    underlyingAssetDecimals: 18,
    strikeAssetSymbol: 'USDC',
    strikeAssetDecimals: 6,
    strikePrice: ethers.BigNumber.from(300e6.toString()),
    strikePriceDecimals: 6,
    expirationDate: 900000,
    amountToMint: ethers.BigNumber.from(1e18.toString()),
    amountToMintTooLow: 1
  },
  {
    name: 'ETH/DAI',
    underlyingAssetSymbol: 'WETH',
    underlyingAssetDecimals: 18,
    strikeAssetSymbol: 'DAI',
    strikeAssetDecimals: 18,
    strikePrice: ethers.BigNumber.from(300e6.toString()),
    strikePriceDecimals: 6,
    expirationDate: 900000,
    amountToMint: ethers.BigNumber.from(1e18.toString()),
    amountToMintTooLow: 1
  }
]
scenarios.forEach(scenario => {
  describe('wPodPut.sol - ' + scenario.name, () => {
    let mockUnderlyingAsset
    let mockStrikeAsset
    let factoryContract
    let wPodPut
    let deployer
    let deployerAddress
    let seller
    let sellerAddress
    let buyer
    let buyerAddress
    let delegator
    let delegatorAddress
    let txIdNewOption

    before(async function () {
      [deployer, seller, buyer, delegator] = await ethers.getSigners()
      deployerAddress = await deployer.getAddress()
      sellerAddress = await seller.getAddress()
      buyerAddress = await buyer.getAddress()
      delegatorAddress = await delegator.getAddress()
    })

    beforeEach(async function () {
      const MockERC20 = await ethers.getContractFactory('MintableERC20')
      const MockWETH = await ethers.getContractFactory('WETH')
      const ContractFactory = await ethers.getContractFactory('OptionFactory')

      mockUnderlyingAsset = await MockWETH.deploy()
      mockStrikeAsset = await MockERC20.deploy(scenario.strikeAssetSymbol, scenario.strikeAssetSymbol, scenario.strikeAssetDecimals)
      factoryContract = await ContractFactory.deploy(mockUnderlyingAsset.address)

      // call transaction
      txIdNewOption = await factoryContract.createEthOption(
        scenario.name,
        scenario.name,
        OPTION_TYPE_PUT,
        mockStrikeAsset.address,
        scenario.strikePrice,
        await ethers.provider.getBlockNumber() + 300 // expirationDate = high block number
      )

      const filterFrom = await factoryContract.filters.OptionCreated(deployerAddress)
      const eventDetails = await factoryContract.queryFilter(filterFrom, txIdNewOption.blockNumber, txIdNewOption.blockNumber)

      if (eventDetails.length) {
        const { option } = eventDetails[0].args
        wPodPut = await ethers.getContractAt('wPodPut', option)
      } else {
        console.log('Something went wrong: No events found')
      }

      await wPodPut.deployed()
    })

    async function MintPhase (amountOfOptionsToMint, owner) {
      expect(await wPodPut.balanceOf(sellerAddress)).to.equal(0)

      await mockStrikeAsset.connect(seller).approve(wPodPut.address, ethers.constants.MaxUint256)
      // calculate amount of Strike necessary to mint
      await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

      expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)
      await wPodPut.connect(seller).mint(amountOfOptionsToMint, owner)
      expect(await wPodPut.balanceOf(sellerAddress)).to.equal(amountOfOptionsToMint)
      expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)
    }

    async function ExercisePhase (amountOfOptionsToExercise) {
      await wPodPut.connect(seller).transfer(buyerAddress, amountOfOptionsToExercise)

      const initialBuyerOptionBalance = await wPodPut.balanceOf(buyerAddress)
      const initialBuyerUnderlyingBalance = await ethers.provider.getBalance(buyerAddress)
      const initialContractUnderlyingBalance = await wPodPut.underlyingBalance()
      const initialContractOptionSupply = await wPodPut.totalSupply()

      expect(initialBuyerOptionBalance).to.equal(amountOfOptionsToExercise)
      expect(initialContractUnderlyingBalance).to.equal(0)
      expect(initialContractOptionSupply).to.equal(scenario.amountToMint)
      const txExercise = await wPodPut.connect(buyer).exerciseEth({ value: amountOfOptionsToExercise })
      const txCost = await getTxCost(txExercise)

      const finalBuyerOptionBalance = await wPodPut.balanceOf(buyerAddress)
      const finalBuyerUnderlyingBalance = await ethers.provider.getBalance(buyerAddress)
      const finalContractUnderlyingBalance = await wPodPut.underlyingBalance()
      const finalContractOptionSupply = await wPodPut.totalSupply()

      expect(finalBuyerOptionBalance).to.equal(0)
      expect(finalBuyerUnderlyingBalance).to.equal(initialBuyerUnderlyingBalance.sub(amountOfOptionsToExercise).sub(txCost))
      expect(finalContractUnderlyingBalance).to.equal(amountOfOptionsToExercise)
      expect(finalContractOptionSupply).to.equal(initialContractOptionSupply.sub(amountOfOptionsToExercise))
    }

    describe('Constructor/Initialization checks', () => {
      it('should have correct number of decimals for underlying and strike asset', async () => {
        expect(await wPodPut.strikeAssetDecimals()).to.equal(scenario.strikeAssetDecimals)
        expect(await wPodPut.underlyingAssetDecimals()).to.equal(scenario.underlyingAssetDecimals)
      })

      it('should have equal number of decimals wPodPut and underlyingAsset', async () => {
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
        await expect(
          wPodPut.connect(seller).mint(scenario.amountToMint, sellerAddress)
        ).to.be.revertedWith('ERC20: transfer amount exceeds balance')
      })

      it('should revert if user do not approve collateral to be spended by wPodPut', async () => {
        expect(await wPodPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)

        await expect(
          wPodPut.connect(seller).mint(scenario.amountToMint, sellerAddress)
        ).to.be.revertedWith('ERC20: transfer amount exceeds allowance')
      })

      it('should revert if asked amount is too low', async () => {
        const minimumAmount = ethers.BigNumber.from(scenario.strikePrice).div((10 ** await mockUnderlyingAsset.decimals()).toString())

        if (minimumAmount.gt(0)) return

        expect(await wPodPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(wPodPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)
        await expect(wPodPut.connect(seller).mint(scenario.amountToMintTooLow, sellerAddress)).to.be.revertedWith('Amount too low')
      })

      it('should mint, increase senders option balance and decrease sender strike balance', async () => {
        expect(await wPodPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(wPodPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)
        await wPodPut.connect(seller).mint(scenario.amountToMint, sellerAddress)
        expect(await wPodPut.balanceOf(sellerAddress)).to.equal(scenario.amountToMint)
        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)
      })

      it('should be able to mint on others behalf', async () => {
        expect(await wPodPut.balanceOf(delegatorAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(wPodPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)
        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)

        await wPodPut.connect(seller).mint(scenario.amountToMint, delegatorAddress)
        expect(await wPodPut.balanceOf(sellerAddress)).to.equal(scenario.amountToMint)
        expect(await wPodPut.lockedBalance(delegatorAddress)).to.equal(scenario.amountToMint)
        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)
      })

      it('should revert if user try to mint after expiration', async () => {
        expect(await wPodPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(wPodPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)
        await forceExpiration(wPodPut)
        await expect(
          wPodPut.connect(seller).mint(scenario.amountToMint, sellerAddress)
        ).to.be.revertedWith('Option has expired')
      })
    })

    describe('Exercising options', () => {
      it('should revert if user have underlying enough, but dont have enough options', async () => {
        expect(await ethers.provider.getBalance(buyerAddress)).to.gte(scenario.amountToMint)
        await expect(wPodPut.connect(buyer).exerciseEth({ value: scenario.amountToMint })).to.be.revertedWith('ERC20: burn amount exceeds balance')
      })
      it('should exercise and have all final balances matched', async () => {
        await MintPhase(scenario.amountToMint, sellerAddress)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await wPodPut.connect(seller).transfer(buyerAddress, scenario.amountToMint)

        const initialBuyerOptionBalance = await wPodPut.balanceOf(buyerAddress)
        const initialBuyerUnderlyingBalance = await ethers.provider.getBalance(buyerAddress)
        const initialContractUnderlyingBalance = await wPodPut.underlyingBalance()
        const initialContractStrikeBalance = await wPodPut.strikeBalance()
        const initialContractOptionSupply = await wPodPut.totalSupply()

        expect(initialBuyerOptionBalance).to.equal(scenario.amountToMint)
        // expect(initialBuyerUnderlyingBalance).to.equal(scenario.amountToMint)
        expect(initialContractUnderlyingBalance).to.equal(0)
        expect(initialContractStrikeBalance).to.equal(scenario.strikePrice)
        expect(initialContractOptionSupply).to.equal(scenario.amountToMint)
        const txExercise = await wPodPut.connect(buyer).exerciseEth({ value: scenario.amountToMint })

        const txCost = await getTxCost(txExercise)
        const finalBuyerOptionBalance = await wPodPut.balanceOf(buyerAddress)
        const finalBuyerUnderlyingBalance = await ethers.provider.getBalance(buyerAddress)
        const finalContractUnderlyingBalance = await wPodPut.underlyingBalance()
        const finalContractStrikeBalance = await wPodPut.strikeBalance()
        const finalContractOptionSupply = await wPodPut.totalSupply()

        expect(finalBuyerOptionBalance).to.equal(0)
        expect(finalBuyerUnderlyingBalance).to.equal(initialBuyerUnderlyingBalance.sub(scenario.amountToMint).sub(txCost))
        expect(finalContractUnderlyingBalance).to.equal(scenario.amountToMint)
        expect(finalContractStrikeBalance).to.equal(0)
        expect(finalContractOptionSupply).to.equal(0)
      })
      it('should revert if user try to exercise after expiration', async () => {
        await MintPhase(scenario.amountToMint, sellerAddress)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await wPodPut.connect(seller).transfer(buyerAddress, scenario.amountToMint)
        // Mint Underlying Asset
        await forceExpiration(wPodPut)
        await expect(wPodPut.connect(seller).exerciseEth({ value: scenario.amountToMint })).to.be.revertedWith('Option has expired')
      })
    })

    describe('Unwinding options', () => {
      it('should revert if try to unwind without amount', async () => {
        await expect(wPodPut.connect(seller).unwind(scenario.amountToMint)).to.be.revertedWith('Not enough balance')
      })
      it('should revert if try to unwind amount higher than possible', async () => {
        await MintPhase(scenario.amountToMint, sellerAddress)
        await expect(wPodPut.connect(seller).unwind(2 * scenario.amountToMint)).to.be.revertedWith('Not enough balance')
      })
      it('should unwind, destroy sender option, reduce his balance and send strike back', async () => {
        await MintPhase(scenario.amountToMint, sellerAddress)
        const initialSellerOptionBalance = await wPodPut.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialContractUnderlyingBalance = await wPodPut.underlyingBalance()
        const initialContractStrikeBalance = await wPodPut.strikeBalance()
        const initialContractOptionSupply = await wPodPut.totalSupply()

        expect(initialSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialSellerStrikeBalance).to.equal(0)
        expect(initialContractUnderlyingBalance).to.equal(0)
        expect(initialContractStrikeBalance).to.equal(scenario.strikePrice)
        expect(initialContractOptionSupply).to.equal(scenario.amountToMint)
        await expect(wPodPut.connect(seller).unwind(scenario.amountToMint))

        const finalSellerOptionBalance = await wPodPut.balanceOf(sellerAddress)
        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractUnderlyingBalance = await wPodPut.underlyingBalance()
        const finalContractStrikeBalance = await wPodPut.strikeBalance()
        const finalContractOptionSupply = await wPodPut.totalSupply()

        expect(finalSellerOptionBalance).to.equal(0)
        expect(finalSellerStrikeBalance).to.equal(scenario.strikePrice)
        expect(finalContractStrikeBalance).to.equal(0)
        expect(finalContractOptionSupply).to.equal(0)
        expect(finalContractUnderlyingBalance).to.equal(0)
      })
      it('should revert if user try to unwind after expiration', async () => {
        await forceExpiration(wPodPut)
        await expect(
          wPodPut.connect(seller).unwind(scenario.amountToMint)
        ).to.be.revertedWith('Option has expired')
      })
    })

    describe('Withdrawing options', () => {
      it('should revert if user try to withdraw before expiration', async () => {
        await expect(wPodPut.connect(seller).withdraw()).to.be.revertedWith('Option has not expired yet')
      })

      it('should revert if user try to withdraw without balance after expiration', async () => {
        await forceExpiration(wPodPut)
        await expect(wPodPut.connect(seller).withdraw()).to.be.revertedWith('You do not have balance to withdraw')
      })

      it('should withdraw exact amount of Strike Asset', async () => {
        await MintPhase(scenario.amountToMint, sellerAddress)
        // Set Expiration
        const initialSellerOptionBalance = await wPodPut.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialContractStrikeBalance = await wPodPut.strikeBalance()

        expect(initialSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialSellerStrikeBalance).to.equal(0)
        expect(initialContractStrikeBalance).to.equal(scenario.strikePrice)

        await forceExpiration(wPodPut)
        await wPodPut.connect(seller).withdraw()

        const finalSellerOptionBalance = await wPodPut.balanceOf(sellerAddress)
        const finalSellerStrikegBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractStrikeBalance = await wPodPut.strikeBalance()

        expect(finalSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(finalSellerStrikegBalance).to.equal(scenario.strikePrice)
        expect(finalContractStrikeBalance).to.equal(0)
        // Cant withdraw two times in a row
        await expect(wPodPut.connect(seller).withdraw()).to.be.revertedWith('You do not have balance to withdraw')
      })

      it('should withdraw mixed amount of Strike Asset and Underlying Asset', async () => {
        const halfAmountMint = ethers.BigNumber.from(scenario.amountToMint).div(2)
        await MintPhase(scenario.amountToMint, sellerAddress)
        // Exercise half amount of options
        await ExercisePhase(halfAmountMint)
        // Checking balance before withdraw
        const initialSellerOptionBalance = await wPodPut.balanceOf(sellerAddress)
        const initialSellerUnderlyingBalance = await ethers.provider.getBalance(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialContractStrikeBalance = await wPodPut.strikeBalance()
        const initialContractUnderlyingBalance = await wPodPut.underlyingBalance()

        expect(initialSellerOptionBalance).to.equal(halfAmountMint)
        expect(initialSellerStrikeBalance).to.equal(0)
        expect(initialContractStrikeBalance).to.equal(ethers.BigNumber.from(scenario.strikePrice).div(2))
        expect(initialContractUnderlyingBalance).to.equal(halfAmountMint)

        await forceExpiration(wPodPut)
        const txWithdraw = await wPodPut.connect(seller).withdraw()
        const txCost = await getTxCost(txWithdraw)

        const finalSellerOptionBalance = await wPodPut.balanceOf(sellerAddress)
        const finalSellerUnderlyingBalance = await ethers.provider.getBalance(sellerAddress)
        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractStrikeBalance = await wPodPut.strikeBalance()
        const finalContractUnderlyingBalance = await wPodPut.underlyingBalance()

        expect(finalSellerOptionBalance).to.equal(halfAmountMint)
        expect(finalSellerUnderlyingBalance).to.equal(initialSellerUnderlyingBalance.add(halfAmountMint).sub(txCost))
        expect(finalSellerStrikeBalance).to.equal(ethers.BigNumber.from(scenario.strikePrice).div(2))
        expect(finalContractStrikeBalance).to.equal(0)
        expect(finalContractUnderlyingBalance).to.equal(0)
        // Cant withdraw two times in a row
        await expect(wPodPut.connect(seller).withdraw()).to.be.revertedWith('You do not have balance to withdraw')
      })
    })
  })
})
