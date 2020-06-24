const { expect } = require('chai')
const provider = waffle.provider

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

describe('PodToken Contract', () => {
  let mockUnderlyingAsset
  let mockStrikeAsset
  let podToken

  beforeEach(async function () {
    const [sellerAddress, buyerAddress, anotherSellerHolder] = await ethers.getSigners()

    const PodToken = await ethers.getContractFactory('PodToken')
    const MockERC20 = await ethers.getContractFactory('MockERC20')

    mockUnderlyingAsset = await MockERC20.deploy(fixtures.scenarioA.underlyingAssetSymbol, fixtures.scenarioA.underlyingAssetSymbol, fixtures.scenarioA.underlyingAssetDecimals, 1000e8)
    mockStrikeAsset = await MockERC20.deploy(fixtures.scenarioA.strikeAssetSymbol, fixtures.scenarioA.strikeAssetSymbol, fixtures.scenarioA.strikeAssetDecimals, 1000e8)

    await mockUnderlyingAsset.deployed()
    await mockStrikeAsset.deployed()

    podToken = await PodToken.deploy(
      'pod:WBTC:USDC:5000:A',
      'pod:WBTC:USDC:5000:A',
      OPTION_TYPE_PUT,
      mockUnderlyingAsset.address,
      mockStrikeAsset.address,
      fixtures.scenarioA.strikePrice,
      await provider.getBlockNumber() + 3000 // expirationDate = high block number
    )

    await podToken.deployed()
  })

  describe('Constructor/Initialization checks', () => {
    it('Should have correct number of decimals for underlying and strike asset', async () => {
      expect(await podToken.strikeAssetDecimals()).to.equal(fixtures.scenarioA.strikeAssetDecimals)
      expect(await podToken.underlyingAssetDecimals()).to.equal(fixtures.scenarioA.underlyingAssetDecimals)
    })

    it('Podtoken and underlyingAsset should have equal number of decimals', async () => {
      expect(await podToken.decimals()).to.equal(fixtures.scenarioA.underlyingAssetDecimals)
    })

    it('StrikePrice and strikeAsset should have equal number of decimals', async () => {
      expect(await podToken.strikePriceDecimals()).to.equal(await podToken.strikeAssetDecimals())
    })
  })

  // describe('Mint check', () => {
  //   it('Should mint and add balance to the sender', async () => {
  //     await podToken.mint(fixtures.scenarioA.amountToMint);
  //     expect(await podToken.decimals()).to.equal(fixtures.scenarioA.underlyingAssetDecimals)
  //   })
  // })
})
