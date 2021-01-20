const getTimestamp = require('./getTimestamp')
const createOptionFactory = require('./createOptionFactory')

const EXERCISE_TYPE_EUROPEAN = 0
const OPTION_TYPE_PUT = 0

const defaultStrikePrice = ethers.BigNumber.from(8000e6.toString())
const defaultCap = ethers.BigNumber.from(40e8.toString())

module.exports = async function createMockOption ({
  underlyingAsset,
  strikeAsset,
  weth,
  strikePrice = defaultStrikePrice,
  cap = defaultCap
} = {}) {
  const [MockERC20, WETH] = await Promise.all([
    ethers.getContractFactory('MintableERC20'),
    ethers.getContractFactory('WETH')
  ])

  if (!underlyingAsset) {
    underlyingAsset = (await MockERC20.deploy('WBTC', 'WBTC', 8)).address
  }

  if (!strikeAsset) {
    strikeAsset = (await MockERC20.deploy('USDC', 'USDC', 6)).address
  }

  if (!weth) {
    weth = (await WETH.deploy()).address
  }

  const factoryContract = await createOptionFactory(weth)
  const txIdNewOption = await factoryContract.createOption(
    'pod:WBTC:USDC:8000:A',
    'pod:WBTC:USDC:8000:A',
    OPTION_TYPE_PUT,
    EXERCISE_TYPE_EUROPEAN,
    underlyingAsset,
    strikeAsset,
    strikePrice,
    await getTimestamp() + 16 * 24 * 60 * 60,
    24 * 60 * 60,
    cap
  )

  const [deployer] = await ethers.getSigners()
  const filterFrom = await factoryContract.filters.OptionCreated(await deployer.getAddress())
  const eventDetails = await factoryContract.queryFilter(filterFrom, txIdNewOption.blockNumber, txIdNewOption.blockNumber)

  const { option } = eventDetails[0].args
  return await ethers.getContractAt('PodPut', option)
}
