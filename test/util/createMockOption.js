const getTimestamp = require('./getTimestamp')

module.exports = async function createMockOption () {
  ;[ContractFactory, MockERC20, WETH] = await Promise.all([
    ethers.getContractFactory('OptionFactory'),
    ethers.getContractFactory('MintableERC20'),
    ethers.getContractFactory('WETH'),
  ])

  ;[underlyingAsset, strikeAsset, weth] = await Promise.all([
    MockERC20.deploy('WBTC', 'WBTC', 8),
    MockERC20.deploy('USDC', 'USDC', 6),
    WETH.deploy(),
  ])

  const OptionTypePut = 0
  const strikePrice = ethers.BigNumber.from(8000e6.toString())

  const factoryContract = await ContractFactory.deploy(weth.address)
  const txIdNewOption = await factoryContract.createOption(
    'pod:WBTC:USDC:8000:A',
    'pod:WBTC:USDC:8000:A',
    OptionTypePut,
    underlyingAsset.address,
    strikeAsset.address,
    strikePrice,
    await getTimestamp() + 5 * 60 * 60 * 1000,
    20 * 60 * 60
  )

  const [deployer] = await ethers.getSigners()
  const filterFrom = await factoryContract.filters.OptionCreated(await deployer.getAddress())
  const eventDetails = await factoryContract.queryFilter(filterFrom, txIdNewOption.blockNumber, txIdNewOption.blockNumber)

  const { option } = eventDetails[0].args
  return await ethers.getContractAt('PodPut', option)
}
