const { expect } = require('chai')

const OPTION_TYPE_PUT = 0

const fixtures = {
  scenarioA: {
    underlyingAssetSymbol: 'WBTC',
    underlyingAssetDecimals: 8,
    strikeAssetSymbol: 'USDC',
    strikeAssetDecimals: 6,
    strikePrice: (5000e6).toString(),
    strikePriceDecimals: 6,
    expirationDate: 900000,
    initialSellerUnderlyingAmount: (1e8).toString(),
    initialSellerStrikeAmount: (5000e6).toString(),
    amountToMint: 1e8,
    amountToMintTooLow: 1,
    balanceOfContractAfterMint: 1e18,
    balanceOfStrikeAfterMint: 120e6,
    balanceOfUnderlyingAfterMint: 0,
    amountToExercise: 1e18,
    balanceOfUnderlyingAfterExercise: 1e18,
    balanceOfStrikeAfterExercise: 0,
    amountOfStrikeToWithdraw: 0,
    amountOfUnderlyingToWithdraw: 1e18
  }
}

describe('PodPut.sol', () => {
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

  before(async function () {
    [deployer, seller, buyer] = await ethers.getSigners()
    deployerAddress = await deployer.getAddress()
    sellerAddress = await seller.getAddress()
    buyerAddress = await buyer.getAddress()

    // 1) Deploy Factory
    const ContractFactory = await ethers.getContractFactory('OptionFactory')
    factoryContract = await ContractFactory.deploy()
    await factoryContract.deployed()
  })

  beforeEach(async function () {
    // const podPut = await ethers.getContractFactory('podPut')
    const MockERC20 = await ethers.getContractFactory('MintableERC20')

    mockUnderlyingAsset = await MockERC20.deploy(fixtures.scenarioA.underlyingAssetSymbol, fixtures.scenarioA.underlyingAssetSymbol, fixtures.scenarioA.underlyingAssetDecimals)
    mockStrikeAsset = await MockERC20.deploy(fixtures.scenarioA.strikeAssetSymbol, fixtures.scenarioA.strikeAssetSymbol, fixtures.scenarioA.strikeAssetDecimals)

    await mockUnderlyingAsset.deployed()
    await mockStrikeAsset.deployed()

    // call transaction
    const txIdNewOption = await factoryContract.createOption(
      'pod:WBTC:USDC:5000:A',
      'pod:WBTC:USDC:5000:A',
      OPTION_TYPE_PUT,
      mockUnderlyingAsset.address,
      mockStrikeAsset.address,
      fixtures.scenarioA.strikePrice,
      await ethers.provider.getBlockNumber() + 500, // expirationDate = high block number
      mockUnderlyingAsset.address
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

  async function MintPhase (amountOfOptionsToMint) {
    expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

    await mockStrikeAsset.connect(seller).approve(podPut.address, ethers.constants.MaxUint256)
    // calculate amount of Strike necessary to mint
    await mockStrikeAsset.connect(seller).mint(fixtures.scenarioA.strikePrice)

    expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(fixtures.scenarioA.strikePrice)
    await podPut.connect(seller).mint(amountOfOptionsToMint)
    expect(await podPut.balanceOf(sellerAddress)).to.equal(amountOfOptionsToMint)
    expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)
  }

  async function ExercisePhase (amountOfOptionsToExercise) {
    await podPut.connect(seller).transfer(buyerAddress, amountOfOptionsToExercise)

    // Mint Underlying Asset
    await mockUnderlyingAsset.connect(buyer).mint(fixtures.scenarioA.amountToMint)
    // Approve Underlying to be spent by contract
    await mockUnderlyingAsset.connect(buyer).approve(podPut.address, ethers.constants.MaxUint256)

    const initialBuyerOptionBalance = await podPut.balanceOf(buyerAddress)
    const initialBuyerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(buyerAddress)
    const initialContractUnderlyingBalance = await podPut.underlyingBalance()
    const initialContractOptionSupply = await podPut.totalSupply()

    expect(initialBuyerOptionBalance).to.equal(amountOfOptionsToExercise)
    expect(initialBuyerUnderlyingBalance).to.equal(fixtures.scenarioA.amountToMint)
    expect(initialContractUnderlyingBalance).to.equal(0)
    expect(initialContractOptionSupply).to.equal(fixtures.scenarioA.amountToMint)
    await expect(podPut.connect(buyer).exchange(amountOfOptionsToExercise))

    const finalBuyerOptionBalance = await podPut.balanceOf(buyerAddress)
    const finalBuyerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(buyerAddress)
    const finalContractUnderlyingBalance = await podPut.underlyingBalance()
    const finalContractOptionSupply = await podPut.totalSupply()

    expect(finalBuyerOptionBalance).to.equal(0)
    expect(finalBuyerUnderlyingBalance).to.equal(initialBuyerUnderlyingBalance.sub(amountOfOptionsToExercise))
    expect(finalContractUnderlyingBalance).to.equal(amountOfOptionsToExercise)
    expect(finalContractOptionSupply).to.equal(initialContractOptionSupply.sub(amountOfOptionsToExercise))
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
      expect(await podPut.strikeAssetDecimals()).to.equal(fixtures.scenarioA.strikeAssetDecimals)
      expect(await podPut.underlyingAssetDecimals()).to.equal(fixtures.scenarioA.underlyingAssetDecimals)
    })

    it('should have equal number of decimals PodPut and underlyingAsset', async () => {
      expect(await podPut.decimals()).to.equal(fixtures.scenarioA.underlyingAssetDecimals)
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
      await expect(podPut.connect(seller).mint(fixtures.scenarioA.amountToMint)).to.be.revertedWith('ERC20: transfer amount exceeds balance')
    })

    it('should revert if user do not approve collateral to be spended by PodPut', async () => {
      expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

      await mockStrikeAsset.connect(seller).mint(fixtures.scenarioA.strikePrice)

      expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(fixtures.scenarioA.strikePrice)

      await expect(podPut.connect(seller).mint(fixtures.scenarioA.amountToMint)).to.be.revertedWith('ERC20: transfer amount exceeds allowance')
    })

    it('should revert if asked amount is too low', async () => {
      const minimumAmount = ethers.BigNumber.from(fixtures.scenarioA.strikePrice).div(10 ** await mockUnderlyingAsset.decimals())

      if (minimumAmount.gt(0)) return

      expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

      await mockStrikeAsset.connect(seller).approve(podPut.address, ethers.constants.MaxUint256)
      await mockStrikeAsset.connect(seller).mint(fixtures.scenarioA.strikePrice)

      expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(fixtures.scenarioA.strikePrice)
      await expect(podPut.connect(seller).mint(fixtures.scenarioA.amountToMintTooLow)).to.be.revertedWith('amount too low')
    })

    it('should mint, increase senders option balance and decrease sender strike balance', async () => {
      expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

      await mockStrikeAsset.connect(seller).approve(podPut.address, ethers.constants.MaxUint256)
      await mockStrikeAsset.connect(seller).mint(fixtures.scenarioA.strikePrice)

      expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(fixtures.scenarioA.strikePrice)
      await podPut.connect(seller).mint(fixtures.scenarioA.amountToMint)
      expect(await podPut.balanceOf(sellerAddress)).to.equal(fixtures.scenarioA.amountToMint)
      expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)
    })
    it('should revert if user try to mint after expiration', async () => {
      expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

      await mockStrikeAsset.connect(seller).approve(podPut.address, ethers.constants.MaxUint256)
      await mockStrikeAsset.connect(seller).mint(fixtures.scenarioA.strikePrice)

      expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(fixtures.scenarioA.strikePrice)
      await forceExpiration(await podPut.expirationBlockNumber())
      await expect(podPut.connect(seller).mint(fixtures.scenarioA.amountToMint)).to.be.revertedWith('Option has expired')
    })
  })

  describe('Exercising options', () => {
    it('should revert if user have underlying approved, but dont have enough options', async () => {
      // Mint underlying
      await mockUnderlyingAsset.connect(buyer).mint(fixtures.scenarioA.amountToMint)
      // Approve PodPut spend underlying asset
      await mockUnderlyingAsset.connect(buyer).approve(podPut.address, ethers.constants.MaxUint256)
      expect(await mockUnderlyingAsset.balanceOf(buyerAddress)).to.equal(fixtures.scenarioA.amountToMint)
      await expect(podPut.connect(buyer).exchange(fixtures.scenarioA.amountToMint)).to.be.revertedWith('ERC20: burn amount exceeds balance')
    })

    it('should revert if sender not have enough strike balance', async () => {
      await MintPhase(fixtures.scenarioA.amountToMint)
      // Transfer mint to Buyer address => This will happen through Uniswap
      await podPut.connect(seller).transfer(buyerAddress, fixtures.scenarioA.amountToMint)
      expect(await podPut.balanceOf(buyerAddress)).to.equal(fixtures.scenarioA.amountToMint)
      // Approve PodPut spend underlying asset
      await mockUnderlyingAsset.connect(buyer).approve(podPut.address, ethers.constants.MaxUint256)
      await expect(podPut.connect(buyer).exchange(fixtures.scenarioA.amountToMint)).to.be.revertedWith('ERC20: transfer amount exceeds balance')
    })

    it('should revert if not approved strike balance', async () => {
      await MintPhase(fixtures.scenarioA.amountToMint)
      // Transfer mint to Buyer address => This will happen through Uniswap
      await podPut.connect(seller).transfer(buyerAddress, fixtures.scenarioA.amountToMint)
      expect(await podPut.balanceOf(buyerAddress)).to.equal(fixtures.scenarioA.amountToMint)
      // Mint Underlying Asset
      await mockUnderlyingAsset.connect(buyer).mint(fixtures.scenarioA.amountToMint)
      expect(await mockUnderlyingAsset.balanceOf(buyerAddress)).to.equal(fixtures.scenarioA.amountToMint)
      await expect(podPut.connect(buyer).exchange(fixtures.scenarioA.amountToMint)).to.be.revertedWith('ERC20: transfer amount exceeds allowance')
    })

    it('should exercise and have all final balances matched', async () => {
      await MintPhase(fixtures.scenarioA.amountToMint)
      // Transfer mint to Buyer address => This will happen through Uniswap
      await podPut.connect(seller).transfer(buyerAddress, fixtures.scenarioA.amountToMint)

      // Mint Underlying Asset
      await mockUnderlyingAsset.connect(buyer).mint(fixtures.scenarioA.amountToMint)
      // Approve Underlying to be spent by contract
      await mockUnderlyingAsset.connect(buyer).approve(podPut.address, ethers.constants.MaxUint256)

      const initialBuyerOptionBalance = await podPut.balanceOf(buyerAddress)
      const initialBuyerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(buyerAddress)
      const initialContractUnderlyingBalance = await podPut.underlyingBalance()
      const initialContractStrikeBalance = await podPut.strikeBalance()
      const initialContractOptionSupply = await podPut.totalSupply()

      expect(initialBuyerOptionBalance).to.equal(fixtures.scenarioA.amountToMint)
      expect(initialBuyerUnderlyingBalance).to.equal(fixtures.scenarioA.amountToMint)
      expect(initialContractUnderlyingBalance).to.equal(0)
      expect(initialContractStrikeBalance).to.equal(fixtures.scenarioA.strikePrice)
      expect(initialContractOptionSupply).to.equal(fixtures.scenarioA.amountToMint)
      await expect(podPut.connect(buyer).exchange(fixtures.scenarioA.amountToMint))

      const finalBuyerOptionBalance = await podPut.balanceOf(buyerAddress)
      const finalBuyerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(buyerAddress)
      const finalContractUnderlyingBalance = await podPut.underlyingBalance()
      const finalContractStrikeBalance = await podPut.strikeBalance()
      const finalContractOptionSupply = await podPut.totalSupply()

      expect(finalBuyerOptionBalance).to.equal(0)
      expect(finalBuyerUnderlyingBalance).to.equal(0)
      expect(finalContractUnderlyingBalance).to.equal(fixtures.scenarioA.amountToMint)
      expect(finalContractStrikeBalance).to.equal(0)
      expect(finalContractOptionSupply).to.equal(0)
    })
    it('should revert if user try to exercise after expiration', async () => {
      await MintPhase(fixtures.scenarioA.amountToMint)
      // Transfer mint to Buyer address => This will happen through Uniswap
      await podPut.connect(seller).transfer(buyerAddress, fixtures.scenarioA.amountToMint)
      // Mint Underlying Asset
      await mockUnderlyingAsset.connect(buyer).mint(fixtures.scenarioA.amountToMint)
      expect(await mockUnderlyingAsset.balanceOf(buyerAddress)).to.equal(fixtures.scenarioA.amountToMint)
      await forceExpiration(await podPut.expirationBlockNumber())
      await expect(podPut.connect(seller).exchange(fixtures.scenarioA.amountToMint)).to.be.revertedWith('Option has expired')
    })
  })

  describe('Burning options', () => {
    it('should revert if try to burn without amount', async () => {
      await expect(podPut.connect(seller).burn(fixtures.scenarioA.amountToMint)).to.be.revertedWith('Not enough balance')
    })
    it('should revert if try to burn amount higher than possible', async () => {
      await MintPhase(fixtures.scenarioA.amountToMint)
      await expect(podPut.connect(seller).burn(2 * fixtures.scenarioA.amountToMint)).to.be.revertedWith('Not enough balance')
    })
    it('should burn, destroy sender option, reduce his balance and send strike back', async () => {
      await MintPhase(fixtures.scenarioA.amountToMint)
      const initialSellerOptionBalance = await podPut.balanceOf(sellerAddress)
      const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
      const initialContractUnderlyingBalance = await podPut.underlyingBalance()
      const initialContractStrikeBalance = await podPut.strikeBalance()
      const initialContractOptionSupply = await podPut.totalSupply()

      expect(initialSellerOptionBalance).to.equal(fixtures.scenarioA.amountToMint)
      expect(initialSellerStrikeBalance).to.equal(0)
      expect(initialContractUnderlyingBalance).to.equal(0)
      expect(initialContractStrikeBalance).to.equal(fixtures.scenarioA.strikePrice)
      expect(initialContractOptionSupply).to.equal(fixtures.scenarioA.amountToMint)
      await expect(podPut.connect(seller).burn(fixtures.scenarioA.amountToMint))

      const finalSellerOptionBalance = await podPut.balanceOf(sellerAddress)
      const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
      const finalContractUnderlyingBalance = await podPut.underlyingBalance()
      const finalContractStrikeBalance = await podPut.strikeBalance()
      const finalContractOptionSupply = await podPut.totalSupply()

      expect(finalSellerOptionBalance).to.equal(0)
      expect(finalSellerStrikeBalance).to.equal(fixtures.scenarioA.strikePrice)
      expect(finalContractStrikeBalance).to.equal(0)
      expect(finalContractOptionSupply).to.equal(0)
      expect(finalContractUnderlyingBalance).to.equal(0)
    })
    it('should revert if user try to burn after expiration', async () => {
      await forceExpiration(await podPut.expirationBlockNumber())
      await expect(podPut.connect(seller).burn()).to.be.revertedWith('Option has not expired yet')
    })
  })

  describe('Withdrawing options', () => {
    it('should revert if user try to withdraw before expiration', async () => {
      await expect(podPut.connect(seller).withdraw()).to.be.revertedWith('Option has not expired yet')
    })

    it('should revert if user try to withdraw without balance after expiration', async () => {
      // Set Expiration
      const optionExpiration = await podPut.expirationBlockNumber()
      await forceExpiration(optionExpiration)

      await expect(podPut.connect(seller).withdraw()).to.be.revertedWith('You do not have balance to withdraw')
    })

    it('should withdraw exact amount of Strike Asset', async () => {
      await MintPhase(fixtures.scenarioA.amountToMint)
      // Set Expiration
      const initialSellerOptionBalance = await podPut.balanceOf(sellerAddress)
      const initialSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
      const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
      const initialContractStrikeBalance = await podPut.strikeBalance()

      expect(initialSellerOptionBalance).to.equal(fixtures.scenarioA.amountToMint)
      expect(initialSellerUnderlyingBalance).to.equal(0)
      expect(initialSellerStrikeBalance).to.equal(0)
      expect(initialContractStrikeBalance).to.equal(fixtures.scenarioA.strikePrice)

      const optionExpiration = await podPut.expirationBlockNumber()
      await forceExpiration(optionExpiration)

      await podPut.connect(seller).withdraw()

      const finalSellerOptionBalance = await podPut.balanceOf(sellerAddress)
      const finalSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
      const finalSellerStrikegBalance = await mockStrikeAsset.balanceOf(sellerAddress)
      const finalContractStrikeBalance = await podPut.strikeBalance()

      expect(finalSellerOptionBalance).to.equal(fixtures.scenarioA.amountToMint)
      expect(finalSellerUnderlyingBalance).to.equal(0)
      expect(finalSellerStrikegBalance).to.equal(fixtures.scenarioA.strikePrice)
      expect(finalContractStrikeBalance).to.equal(0)
      // Cant withdraw two times in a row
      await expect(podPut.connect(seller).withdraw()).to.be.revertedWith('You do not have balance to withdraw')
    })

    it('should withdraw mixed amount of Strike Asset and Underlying Asset', async () => {
      await MintPhase(fixtures.scenarioA.amountToMint)
      // Exercise half amount of options
      await ExercisePhase(fixtures.scenarioA.amountToMint * 0.5)
      // Checking balance before withdraw
      const initialSellerOptionBalance = await podPut.balanceOf(sellerAddress)
      const initialSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
      const initialSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
      const initialContractStrikeBalance = await podPut.strikeBalance()
      const initialContractUnderlyingBalance = await podPut.underlyingBalance()

      expect(initialSellerOptionBalance).to.equal(fixtures.scenarioA.amountToMint * 0.5)
      expect(initialSellerUnderlyingBalance).to.equal(0)
      expect(initialSellerStrikeBalance).to.equal(0)
      expect(initialContractStrikeBalance).to.equal(fixtures.scenarioA.strikePrice * 0.5)
      expect(initialContractUnderlyingBalance).to.equal(fixtures.scenarioA.amountToMint * 0.5)

      const optionExpiration = await podPut.expirationBlockNumber()
      await forceExpiration(optionExpiration)

      await podPut.connect(seller).withdraw()

      const finalSellerOptionBalance = await podPut.balanceOf(sellerAddress)
      const finalSellerUnderlyingBalance = await mockUnderlyingAsset.balanceOf(sellerAddress)
      const finalSellerStrikeBalance = await mockStrikeAsset.balanceOf(sellerAddress)
      const finalContractStrikeBalance = await podPut.strikeBalance()
      const finalContractUnderlyingBalance = await podPut.underlyingBalance()

      expect(finalSellerOptionBalance).to.equal(fixtures.scenarioA.amountToMint * 0.5)
      expect(finalSellerUnderlyingBalance).to.equal(fixtures.scenarioA.amountToMint * 0.5)
      expect(finalSellerStrikeBalance).to.equal(fixtures.scenarioA.strikePrice * 0.5)
      expect(finalContractStrikeBalance).to.equal(0)
      expect(finalContractUnderlyingBalance).to.equal(0)
      // Cant withdraw two times in a row
      await expect(podPut.connect(seller).withdraw()).to.be.revertedWith('You do not have balance to withdraw')
    })
  })
})
