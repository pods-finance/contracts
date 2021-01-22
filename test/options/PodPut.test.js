const { expect } = require('chai')
const getTimestamp = require('../util/getTimestamp')
const forceExpiration = require('../util/forceExpiration')
const forceEndOfExerciseWindow = require('../util/forceEndOfExerciseWindow')
const { takeSnapshot, revertToSnapshot } = require('../util/snapshot')
const MockERC20ABI = require('../../abi/ERC20.json')
const createConfigurationManager = require('../util/createConfigurationManager')

const { deployMockContract } = waffle

const EXERCISE_TYPE_EUROPEAN = 0 // European

const scenarios = [
  {
    name: 'WBTC/aUSDC',
    underlyingAssetSymbol: 'WBTC',
    underlyingAssetDecimals: 8,
    strikeAssetSymbol: 'aUSDC',
    strikeAssetDecimals: 6,
    strikePrice: ethers.BigNumber.from(7000e6.toString()),
    amountToMint: ethers.BigNumber.from(1e8.toString()),
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
        await expect(podPut).to.revertedWith('PodOption: expiration should be in a future timestamp')
      })

      it('should not allow exerciseWindowSize lesser than or equal 0', async () => {
        podPut = PodPut.deploy(
          'pod:WBTC:USDC:5000:A',
          'pod:WBTC:USDC:5000:A',
          EXERCISE_TYPE_EUROPEAN,
          mockUnderlyingAsset.address,
          mockStrikeAsset.address,
          scenario.strikePrice,
          await getTimestamp() + 24 * 60 * 60,
          0,
          configurationManager.address
        )
        await expect(podPut).to.revertedWith('PodOption: exercise window size must be greater than zero')
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

      it('should not allow exercise windows shorter than 24 hours', async () => {
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

      it('should return right booleans if the option is expired or not', async () => {
        expect(await podPut.hasExpired()).to.be.false
        expect(await podPut.isAfterEndOfExerciseWindow()).to.be.false

        await forceExpiration(podPut)

        expect(await podPut.hasExpired()).to.be.true
        expect(await podPut.isAfterEndOfExerciseWindow()).to.be.false

        await forceEndOfExerciseWindow(podPut)

        expect(await podPut.hasExpired()).to.be.true
        expect(await podPut.isAfterEndOfExerciseWindow()).to.be.true
      })
    })

    describe('Minting options', () => {
      it('should revert if user do not have enough collateral', async () => {
        expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

        await mockStrikeAsset.connect(seller).approve(podPut.address, ethers.constants.MaxUint256)

        expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)
        await expect(podPut.connect(seller).mint(scenario.amountToMint, sellerAddress)).to.be.revertedWith('ERC20: transfer amount exceeds balance')
      })

      it('should revert if user do not approve collateral to be spent by podPut', async () => {
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
        const capProvider = await ethers.getContractAt('Cap', configurationManager.getCapProvider())
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

        await forceEndOfExerciseWindow(podPut)
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

        await forceEndOfExerciseWindow(podPut)
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

        await forceExpiration(podPut)
        await expect(podPut.connect(seller).mint(scenario.amountToMint, sellerAddress)).to.be.revertedWith('PodOption: option has expired')
      })
    })

    describe('Exercising options', () => {
      it('should revert if amount of options asked is zero', async () => {
        await forceExpiration(podPut)
        await expect(podPut.connect(seller).exercise(ethers.BigNumber.from(0)))
          .to.be.revertedWith('PodPut: you can not exercise zero options')
      })

      it('should revert if transfer fail from ERC20', async () => {
        // deploy option with mock function
        const mockModERC20 = await deployMockContract(deployer, MockERC20ABI)

        await mockModERC20.mock.decimals.returns(6)
        await mockModERC20.mock.transferFrom.returns(true)
        await mockModERC20.mock.transfer.returns(true)

        const specificScenario = {
          name: 'WBTC/USDC',
          underlyingAssetSymbol: 'WBTC',
          underlyingAssetDecimals: 8,
          strikeAssetSymbol: 'USDC',
          strikeAssetDecimals: 6,
          strikePrice: ethers.BigNumber.from(300e6.toString()),
          amountToMint: ethers.BigNumber.from(1e8.toString())
        }

        podPut = await PodPut.deploy(
          'pod:BRL:USDC:0.21',
          'pod:BRL:USDC:0.21',
          EXERCISE_TYPE_EUROPEAN,
          mockUnderlyingAsset.address,
          mockModERC20.address,
          specificScenario.strikePrice,
          await getTimestamp() + 24 * 60 * 60 * 7,
          24 * 60 * 60, // 24h
          configurationManager.address
        )
        await podPut.deployed()

        await podPut.connect(seller).mint(specificScenario.amountToMint, sellerAddress)

        await mockUnderlyingAsset.connect(buyer).mint(specificScenario.amountToMint)
        // Approve PodPut spend underlying asset
        await mockUnderlyingAsset.connect(buyer).approve(podPut.address, ethers.constants.MaxUint256)

        await forceExpiration(podPut)
        await expect(podPut.connect(seller).exercise(specificScenario.amountToMint)).to.be.revertedWith('transfer amount exceeds balance')
      })

      it('should revert if user try to exercise before expiration', async () => {
        await MintPhase(scenario.amountToMint)
        // Transfer mint to Buyer address => This will happen through Uniswap
        await podPut.connect(seller).transfer(buyerAddress, scenario.amountToMint)
        // Mint Underlying Asset
        await mockUnderlyingAsset.connect(buyer).mint(scenario.amountToMint)
        await expect(podPut.connect(seller).exercise(scenario.amountToMint)).to.be.revertedWith('PodOption: option has not expired yet')
      })

      it('should revert if user have underlying approved, but do not have enough options', async () => {
        // Mint underlying
        await mockUnderlyingAsset.connect(buyer).mint(scenario.amountToMint)
        // Approve PodPut spend underlying asset
        await mockUnderlyingAsset.connect(buyer).approve(podPut.address, ethers.constants.MaxUint256)
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

        await forceExpiration(podPut)
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
        await forceEndOfExerciseWindow(podPut)
        await expect(podPut.connect(seller).exercise(scenario.amountToMint)).to.be.reverted
      })
    })

    describe('Unminting options', () => {
      it('should revert if try to unmint without amount', async () => {
        await expect(podPut.connect(seller).unmint(scenario.amountToMint)).to.be.revertedWith('PodPut: you do not have minted options')
      })
      it('should revert if try to unmint amount higher than possible', async () => {
        await MintPhase(scenario.amountToMint)
        await expect(podPut.connect(seller).unmint(2 * scenario.amountToMint)).to.be.revertedWith('PodPut: not enough minted options')
      })
      it('should revert if unmint amount is too low', async () => {
        const minimumAmount = ethers.BigNumber.from(scenario.strikePrice).div((10 ** await mockUnderlyingAsset.decimals()).toString())
        if (minimumAmount.gt(0)) return
        await MintPhase(scenario.amountToMint)
        await expect(podPut.connect(seller).unmint(scenario.amountToMintTooLow, sellerAddress)).to.be.revertedWith('Amount too low')
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
        await forceExpiration(podPut)
        await expect(podPut.connect(seller).unmint()).to.be.revertedWith('PodOption: option has not expired yet')
      })
    })

    describe('Withdrawing options', () => {
      it('should revert if user try to withdraw before expiration', async () => {
        await expect(podPut.connect(seller).withdraw()).to.be.revertedWith('PodOption: window of exercise has not ended yet')
      })

      it('should revert if user try to withdraw without balance after expiration', async () => {
        // Set Expiration
        await forceEndOfExerciseWindow(podPut)

        await expect(podPut.connect(seller).withdraw()).to.be.revertedWith('PodPut: you do not have balance to withdraw')
      })

      it('should get withdraw amounts correctly in a mixed amount of Strike Asset and Underlying Asset (Ma-Mb-Ec-Wa-Wb)', async () => {
        await MintPhase(scenario.amountToMint)
        await MintPhase(scenario.amountToMint, buyer, buyerAddress)

        await forceExpiration(podPut)
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

        await forceEndOfExerciseWindow(podPut)
        await podPut.connect(seller).withdraw()

        const finalSellerOptionBalance = await podPut.balanceOf(sellerAddress)
        const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
        const finalContractStrikeReserves = await podPut.strikeReserves()

        expect(finalSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(finalSellerStrikeBalance).to.equal(scenario.strikePrice.add(earnedInterest))
        expect(finalContractStrikeReserves).to.equal(0)
        // Cant withdraw two times in a row
        // await expect(podPut.connect(seller).withdraw()).to.be.revertedWith('PodPut: you do not have balance to withdraw')
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
        const initialContractStrikeReserves = await podPut.strikeReserves()

        expect(initialSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(initialSellerStrikeBalance).to.equal(0)
        expect(initialContractStrikeReserves).to.gt(scenario.strikePrice.add(twoTimesAmountToMint))

        await forceEndOfExerciseWindow(podPut)
        await podPut.connect(seller).withdraw()

        const finalSellerOptionBalance = await podPut.balanceOf(sellerAddress)
        const finalSellerStrikegBalance = await mockStrikeAsset.balanceOf(sellerAddress)

        expect(finalSellerOptionBalance).to.equal(scenario.amountToMint)
        expect(finalSellerStrikegBalance).to.gt(scenario.strikePrice)
        expect(finalSellerStrikegBalance).to.lt(scenario.strikePrice.mul(twoTimesAmountToMint).div(10 ** optionDecimals))
        // Cant withdraw two times in a row
        await expect(podPut.connect(seller).withdraw()).to.be.revertedWith('PodPut: you do not have balance to withdraw')

        await podPut.connect(buyer).withdraw()

        const finalBuyerStrikeBalance = await mockStrikeAsset.balanceOf(buyerAddress)
        const finalContractStrikeReserves = await podPut.strikeReserves()

        expect(finalBuyerStrikeBalance).to.gt(scenario.strikePrice.mul(twoTimesAmountToMint).div(10 ** optionDecimals))
        expect(finalContractStrikeReserves).to.equal(0)

        await expect(podPut.connect(buyer).withdraw()).to.be.revertedWith('PodPut: you do not have balance to withdraw')
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
        await expect(podPut.connect(seller).withdraw()).to.be.revertedWith('PodPut: you do not have balance to withdraw')

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
        await expect(podPut.connect(buyer).withdraw()).to.be.revertedWith('PodPut: you do not have balance to withdraw')

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
