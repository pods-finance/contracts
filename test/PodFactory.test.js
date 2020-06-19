const { accounts, contract, web3 } = require('@openzeppelin/test-environment')

const {
  BN, // Big Number support
  constants, // Common constants, like the zero address and largest integers
  expectEvent, // Assertions for emitted events
  expectRevert // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers')

const PodFactory = contract.fromArtifact('PodFactory')
const MockERC20 = contract.fromArtifact('MockERC20')

let PodFactoryContract
let underlyingAsset
let strikeAsset

const ScenarioA = [
  'Pods Put WBTC USDC 5000 2020-06-23',
  'podWBTC:20AA',
  1,
  null,
  null,
  5000000000,
  1000
]

describe('PodFactory.sol', function () {
  const [sender, receiver] = accounts

  beforeEach(async function () {
    PodFactoryContract = await PodFactory.new()
    underlyingAsset = await MockERC20.new('Wrapped BTC', 'WBTC', 8, 1000e8)
    strikeAsset = await MockERC20.new('USDC Token', 'USDC', 6, 1000e8)
    ScenarioA[3] = underlyingAsset.address
    ScenarioA[4] = strikeAsset.address
  })

  describe('Checking correct initial parameters', function () {
    it('options array to be empty', async function () {
      const result = await PodFactoryContract.getNumberOfOptions()
      expect(result.toNumber()).toEqual(0)
    })
  })

  describe('Checking correct createOption', function () {
    it('optionsArray should have one element and emit event', async function () {
      ScenarioA[6] = await web3.eth.getBlockNumber() + 1000
      const txReceipt = await PodFactoryContract.createOption(...ScenarioA)
      expectEvent(txReceipt, 'OptionCreated')
      const result = await PodFactoryContract.getNumberOfOptions()
      expect(result.toNumber()).toEqual(1)
    })
  })

  describe('reverts when deploying with invalid parameters', function () {
    it('expiration lower than current block', async function () {
      ScenarioA[6] = 1
      await expectRevert(PodFactoryContract.createOption(...ScenarioA), 'expiration lower than current block')
    })
  })
})
