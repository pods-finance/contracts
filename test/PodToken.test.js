const { use, expect } = require('chai')
const { solidity, MockProvider, getWallets, deployContract } = require('ethereum-waffle')
const { TestHelper } = require('@openzeppelin/cli')
const PodToken = require('../build/PodToken.json')
const MockERC20 = require('../build/MockERC20.json')

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

use(solidity)

describe('PodToken Contract', () => {
  const provider = new MockProvider()
  const [wallet] = provider.getWallets()
  let mockUnderlyingAsset
  let mockStrikeAsset
  let podToken
  let sellerAddress
  let buyerAddress
  let anotherSellerHolder

  beforeEach(async function () {
    this.project = await TestHelper()

    sellerAddress = wallet[0]
    buyerAddress = wallet[1]
    anotherSellerHolder = wallet[2]

    mockUnderlyingAsset = await deployContract(
      wallet,
      MockERC20,
      [
        fixtures.scenarioA.underlyingAssetSymbol,
        fixtures.scenarioA.underlyingAssetSymbol,
        fixtures.scenarioA.underlyingAssetDecimals
      ]
    )

    mockStrikeAsset = await deployContract(
      wallet,
      MockERC20,
      [
        fixtures.scenarioA.strikeAssetSymbol,
        fixtures.scenarioA.strikeAssetSymbol,
        fixtures.scenarioA.strikeAssetDecimals
      ]
    )

    podToken = await deployPodToken()
  })

  async function deployPodToken () {
    const podToken = await deployContract(
      wallet, // a wallet to sign transactions
      PodToken, // the compiled output
      ['pod:WBTC:USDC:5000:A',
        'pod:WBTC:USDC:5000:A',
        mockUnderlyingAsset.address,
        mockStrikeAsset.address,
        fixtures.scenarioA.strikePrice,
        fixtures.scenarioA.strikePriceDecimals] // arguments to the smart contract constructor
    )
    return podToken // an ethers 'Contract' class instance
  }

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
