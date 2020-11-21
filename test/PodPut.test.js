const { expect } = require('chai')
const BigNumber = require('bignumber.js')
const forceExpiration = require('./util/forceExpiration')
const forceEndOfExerciseWindow = require('./util/forceEndOfExerciseWindow')
const getTimestamp = require('./util/getTimestamp')

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
    amountToMintTooLow: 1
  },
  {
    name: 'WETH/USDC',
    underlyingAssetSymbol: 'WETH',
    underlyingAssetDecimals: 18,
    strikeAssetSymbol: 'USDC',
    strikeAssetDecimals: 6,
    strikePrice: ethers.BigNumber.from(300e6.toString()),
    strikePriceDecimals: 6,
    amountToMint: ethers.BigNumber.from(1e18.toString()),
    amountToMintTooLow: 1
  },
  {
    name: 'WBTC/DAI',
    underlyingAssetSymbol: 'WBTC',
    underlyingAssetDecimals: 8,
    strikeAssetSymbol: 'DAI',
    strikeAssetDecimals: 18,
    strikePrice: ethers.BigNumber.from(300e18.toString()),
    strikePriceDecimals: 18,
    amountToMint: ethers.BigNumber.from(1e8.toString()),
    amountToMintTooLow: 1
  },
  {
    name: 'WETH/DAI',
    underlyingAssetSymbol: 'WETH',
    underlyingAssetDecimals: 18,
    strikeAssetSymbol: 'DAI',
    strikeAssetDecimals: 18,
    strikePrice: ethers.BigNumber.from(300e6.toString()),
    strikePriceDecimals: 6,
    amountToMint: ethers.BigNumber.from(1e18.toString()),
    amountToMintTooLow: 1
  }
]
scenarios.forEach(scenario => {
  describe('PodPut.sol - ' + scenario.name, () => {
    let mockUnderlyingAsset
    let mockStrikeAsset
    let factoryContract
    let podPut
    let deployer
    let deployerAddress
    let seller
    let sellerAddress
    let buyer
    let buyerAddress
    let delegator
    let delegatorAddress

    before(async function () {
      [deployer, seller, buyer, delegator] = await ethers.getSigners()
      deployerAddress = await deployer.getAddress()
      sellerAddress = await seller.getAddress()
      buyerAddress = await buyer.getAddress()
      delegatorAddress = await delegator.getAddress()
    })

    beforeEach(async function () {
      const MockERC20 = await ethers.getContractFactory('MintableERC20')
      const ContractFactory = await ethers.getContractFactory('OptionFactory')
      const MockWETH = await ethers.getContractFactory('WETH')

      const mockWeth = await MockWETH.deploy()
      factoryContract = await ContractFactory.deploy(mockWeth.address)
      mockUnderlyingAsset = await MockERC20.deploy(scenario.underlyingAssetSymbol, scenario.underlyingAssetSymbol, scenario.underlyingAssetDecimals)
      mockStrikeAsset = await MockERC20.deploy(scenario.strikeAssetSymbol, scenario.strikeAssetSymbol, scenario.strikeAssetDecimals)

      // call transaction
      const txIdNewOption = await factoryContract.createOption(
        'pod:WBTC:USDC:5000:A',
        'pod:WBTC:USDC:5000:A',
        OPTION_TYPE_PUT,
        mockUnderlyingAsset.address,
        mockStrikeAsset.address,
        scenario.strikePrice,
        await getTimestamp() + 24 * 60 * 60,
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

    async function MintPhase (amountOfOptionsToMint, owner) {
      expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

      await mockStrikeAsset.connect(seller).approve(podPut.address, ethers.constants.MaxUint256)
      // calculate amount of Strike necessary to mint
      await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

      expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)
      await podPut.connect(seller).mint(amountOfOptionsToMint, owner)
      expect(await podPut.balanceOf(sellerAddress)).to.equal(amountOfOptionsToMint)
      expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)
    }

    async function ExercisePhase (amountOfOptionsToExercise) {
      await podPut.connect(seller).transfer(buyerAddress, amountOfOptionsToExercise)

      // Mint Underlying Asset
      await mockUnderlyingAsset.connect(buyer).mint(scenario.amountToMint)
      // Approve Underlying to be spent by contract
      await mockUnderlyingAsset.connect(buyer).approve(podPut.address, ethers.constants.MaxUint256)

      const initialBuyerOptionBalance = await podPut.balanceOf(buyerAddress)
      const initialBuyerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(buyerAddress)
      const initialContractUnderlyingBalance = await podPut.underlyingBalance()
      const initialContractOptionSupply = await podPut.totalSupply()

      expect(initialBuyerOptionBalance).to.equal(amountOfOptionsToExercise)
      expect(initialBuyerUnderlyingBalance).to.equal(scenario.amountToMint)
      expect(initialContractUnderlyingBalance).to.equal(0)
      expect(initialContractOptionSupply).to.equal(scenario.amountToMint)
      await expect(podPut.connect(buyer).exercise(amountOfOptionsToExercise))

      const finalBuyerOptionBalance = await podPut.balanceOf(buyerAddress)
      const finalBuyerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(buyerAddress)
      const finalContractUnderlyingBalance = await podPut.underlyingBalance()
      const finalContractOptionSupply = await podPut.totalSupply()

      expect(finalBuyerOptionBalance).to.equal(0)
      expect(finalBuyerUnderlyingBalance).to.equal(initialBuyerUnderlyingBalance.sub(amountOfOptionsToExercise))
      expect(finalContractUnderlyingBalance).to.equal(amountOfOptionsToExercise)
      expect(finalContractOptionSupply).to.equal(initialContractOptionSupply.sub(amountOfOptionsToExercise))
    }

    describe('Constructor/Initialization checks', () => {
      it('should have correct number of decimals for underlying and strike asset', async () => {
        expect(await podPut.strikeAssetDecimals()).to.equal(scenario.strikeAssetDecimals)
        expect(await podPut.underlyingAssetDecimals()).to.equal(scenario.underlyingAssetDecimals)
      })

      it('should have equal number of decimals PodPut and underlyingAsset', async () => {
        expect(await podPut.decimals()).to.equal(scenario.underlyingAssetDecimals)
      })

      it('should have equal number of decimals StrikePrice and strikeAsset', async () => {
        expect(await podPut.strikePriceDecimals()).to.equal(await podPut.strikeAssetDecimals())
      })

      it('should not allow underlyingAsset/strikeAsset with 0x0 address', async () => {
        podPut = factoryContract.createOption(
          'pod:WBTC:USDC:5000:A',
          'pod:WBTC:USDC:5000:A',
          OPTION_TYPE_PUT,
          ethers.constants.AddressZero,
          mockStrikeAsset.address,
          scenario.strikePrice,
          await getTimestamp() + 24 * 60 * 60,
          24 * 60 * 60 // 24h
        )
        await expect(podPut).to.revertedWith('PodOption/underlying-asset-is-not-a-contract')

        podPut = factoryContract.createOption(
          'pod:WBTC:USDC:5000:A',
          'pod:WBTC:USDC:5000:A',
          OPTION_TYPE_PUT,
          mockUnderlyingAsset.address,
          ethers.constants.AddressZero,
          scenario.strikePrice,
          await getTimestamp() + 24 * 60 * 60,
          24 * 60 * 60 // 24h
        )
        await expect(podPut).to.revertedWith('PodOption/strike-asset-is-not-a-contract')
      })

      it('should not allow underlyingAsset/strikeAsset that are not contracts', async () => {
        podPut = factoryContract.createOption(
          'pod:WBTC:USDC:5000:A',
          'pod:WBTC:USDC:5000:A',
          OPTION_TYPE_PUT,
          sellerAddress,
          mockStrikeAsset.address,
          scenario.strikePrice,
          await getTimestamp() + 24 * 60 * 60,
          24 * 60 * 60 // 24h
        )
        await expect(podPut).to.revertedWith('PodOption/underlying-asset-is-not-a-contract')

        podPut = factoryContract.createOption(
          'pod:WBTC:USDC:5000:A',
          'pod:WBTC:USDC:5000:A',
          OPTION_TYPE_PUT,
          mockUnderlyingAsset.address,
          sellerAddress,
          scenario.strikePrice,
          await getTimestamp() + 24 * 60 * 60,
          24 * 60 * 60 // 24h
        )
        await expect(podPut).to.revertedWith('PodOption/strike-asset-is-not-a-contract')
      })

      it('should not allow for underlyingAsset and strikeAsset too be the same address', async () => {
        podPut = factoryContract.createOption(
          'pod:WBTC:USDC:5000:A',
          'pod:WBTC:USDC:5000:A',
          OPTION_TYPE_PUT,
          mockStrikeAsset.address,
          mockStrikeAsset.address,
          scenario.strikePrice,
          await getTimestamp() + 24 * 60 * 60,
          24 * 60 * 60 // 24h
        )
        await expect(podPut).to.revertedWith('PodOption/underlying-asset-and-strike-asset-must-differ')
      })
    })

    describe('Minting options', () => {
      it('should revert if user dont have enough collateral', async () => {
        expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(podPut.address, ethers.constants.MaxUint256)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)
        await expect(
          podPut.connect(seller).mint(scenario.amountToMint, sellerAddress)
        ).to.be.revertedWith('ERC20: transfer amount exceeds balance')
      })

      it('should revert if user do not approve collateral to be spended by PodPut', async () => {
        expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)

        await expect(
          podPut.connect(seller).mint(scenario.amountToMint, sellerAddress)
        ).to.be.revertedWith('ERC20: transfer amount exceeds allowance')
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

      it('should be able to mint on others behalf', async () => {
        expect(await podPut.balanceOf(delegatorAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(podPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)
        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)

        await podPut.connect(seller).mint(scenario.amountToMint, delegatorAddress)
        expect(await podPut.balanceOf(sellerAddress)).to.equal(scenario.amountToMint)
        expect(await podPut.lockedBalance(delegatorAddress)).to.equal(scenario.amountToMint)
        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)
      })

      it('should revert if user try to mint after expiration', async () => {
        expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(podPut.address, ethers.constants.MaxUint256)
        await mockStrikeAsset.connect(seller).mint(scenario.strikePrice)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(scenario.strikePrice)
        await forceExpiration(podPut)
        await expect(
          podPut.connect(seller).mint(scenario.amountToMint, sellerAddress)
        ).to.be.revertedWith('Option has expired')
      })
    })

    describe('Exercising options', () => {
      it('should revert if user try to exercise before expiration', async () => {
        await MintPhase(scenario.amountToMint, sellerAddress)
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
        await MintPhase(scenario.amountToMint, sellerAddress)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await podPut.connect(seller).transfer(buyerAddress, scenario.amountToMint)
        expect(await podPut.balanceOf(buyerAddress)).to.equal(scenario.amountToMint)
        // Approve PodPut spend underlying asset
        await mockUnderlyingAsset.connect(buyer).approve(podPut.address, ethers.constants.MaxUint256)
        await forceExpiration(podPut)
        await expect(podPut.connect(buyer).exercise(scenario.amountToMint)).to.be.revertedWith('ERC20: transfer amount exceeds balance')
      })

      it('should revert if not approved strike balance', async () => {
        await MintPhase(scenario.amountToMint, sellerAddress)
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
        await MintPhase(scenario.amountToMint, sellerAddress)
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
        await MintPhase(scenario.amountToMint, sellerAddress)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await podPut.connect(seller).transfer(buyerAddress, scenario.amountToMint)
        // Mint Underlying Asset
        await mockUnderlyingAsset.connect(buyer).mint(scenario.amountToMint)
        expect(await mockUnderlyingAsset.balanceOf(buyerAddress)).to.equal(scenario.amountToMint)
        await forceEndOfExerciseWindow(podPut)
        await expect(podPut.connect(seller).exercise(scenario.amountToMint)).to.be.revertedWith('Window of exercise has closed already')
      })
    })

    describe('Unwinding options', () => {
      it('should revert if try to unwind without amount', async () => {
        await expect(podPut.connect(seller).unwind(scenario.amountToMint)).to.be.revertedWith('Not enough balance')
      })
      it('should revert if try to unwind amount higher than possible', async () => {
        await MintPhase(scenario.amountToMint, sellerAddress)
        await expect(podPut.connect(seller).unwind(2 * scenario.amountToMint)).to.be.revertedWith('Not enough balance')
      })
      it('should revert if try to unwind amount lower than possible', async () => {
        const minimumAmount = ethers.BigNumber.from(scenario.strikePrice).div((10 ** await mockUnderlyingAsset.decimals()).toString())

        if (minimumAmount.gt(0)) return

        await MintPhase(scenario.amountToMint, sellerAddress)

        await expect(
          podPut.connect(seller).unwind(scenario.amountToMintTooLow)
        ).to.be.revertedWith('Amount too low')
      })
      it('should unwind, destroy sender option, reduce his balance and send strike back', async () => {
        await MintPhase(scenario.amountToMint, sellerAddress)
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
        await expect(podPut.connect(seller).unwind(scenario.amountToMint))

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
      it('should revert if user try to unwind after expiration', async () => {
        await forceExpiration(podPut)
        await expect(
          podPut.connect(seller).unwind(scenario.amountToMint)
        ).to.be.revertedWith('Option has expired')
      })
    })

    describe('Withdrawing options', () => {
      it('should revert if user try to withdraw before expiration', async () => {
        await expect(podPut.connect(seller).withdraw()).to.be.revertedWith('Window of exercise not close yet')
      })
      it('should revert if user try to withdraw before end of exercise window', async () => {
        await forceExpiration(podPut)
        await expect(podPut.connect(seller).withdraw()).to.be.revertedWith('Window of exercise not close yet')
      })

      it('should revert if user try to withdraw without balance after expiration', async () => {
        await forceEndOfExerciseWindow(podPut)
        await expect(podPut.connect(seller).withdraw()).to.be.revertedWith('You do not have balance to withdraw')
      })

      it('should withdraw exact amount of Strike Asset', async () => {
        await MintPhase(scenario.amountToMint, sellerAddress)
        // Set Expiration
        const initialSellerOptionBalance = await podPut.balanceOf(sellerAddress)
        const initialSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialContractStrikeBalance = await podPut.strikeBalance()

        expect(initialSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialSellerUnderlyingBalance).to.equal(0)
        expect(initialSellerStrikeBalance).to.equal(0)
        expect(initialContractStrikeBalance).to.equal(scenario.strikePrice)

        await forceEndOfExerciseWindow(podPut)
        await podPut.connect(seller).withdraw()

        const finalSellerOptionBalance = await podPut.balanceOf(sellerAddress)
        const finalSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
        const finalSellerStrikegBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractStrikeBalance = await podPut.strikeBalance()

        expect(finalSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(finalSellerUnderlyingBalance).to.equal(0)
        expect(finalSellerStrikegBalance).to.equal(scenario.strikePrice)
        expect(finalContractStrikeBalance).to.equal(0)
        // Cant withdraw two times in a row
        await expect(podPut.connect(seller).withdraw()).to.be.revertedWith('You do not have balance to withdraw')
      })

      it('should withdraw mixed amount of Strike Asset and Underlying Asset', async () => {
        const halfAmountMint = ethers.BigNumber.from(scenario.amountToMint).div(2)
        await MintPhase(scenario.amountToMint, sellerAddress)
        // Exercise half amount of options
        await forceExpiration(podPut)
        await ExercisePhase(halfAmountMint)
        // Checking balance before withdraw
        const initialSellerOptionBalance = await podPut.balanceOf(sellerAddress)
        const initialSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
        const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const initialContractStrikeBalance = await podPut.strikeBalance()
        const initialContractUnderlyingBalance = await podPut.underlyingBalance()

        expect(initialSellerOptionBalance).to.equal(halfAmountMint)
        expect(initialSellerUnderlyingBalance).to.equal(0)
        expect(initialSellerStrikeBalance).to.equal(0)
        expect(initialContractStrikeBalance).to.equal(ethers.BigNumber.from(scenario.strikePrice).div(2))
        expect(initialContractUnderlyingBalance).to.equal(halfAmountMint)

        await forceEndOfExerciseWindow(podPut)
        await podPut.connect(seller).withdraw()

        const finalSellerOptionBalance = await podPut.balanceOf(sellerAddress)
        const finalSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractStrikeBalance = await podPut.strikeBalance()
        const finalContractUnderlyingBalance = await podPut.underlyingBalance()

        expect(finalSellerOptionBalance).to.equal(halfAmountMint)
        expect(finalSellerUnderlyingBalance).to.equal(halfAmountMint)
        expect(finalSellerStrikeBalance).to.equal(ethers.BigNumber.from(scenario.strikePrice).div(2))
        expect(finalContractStrikeBalance).to.equal(0)
        expect(finalContractUnderlyingBalance).to.equal(0)
        // Cant withdraw two times in a row
        await expect(podPut.connect(seller).withdraw()).to.be.revertedWith('You do not have balance to withdraw')
      })
    })
  })
})
