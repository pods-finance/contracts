const bre = require('@nomiclabs/buidler')
const getTimestamp = require('./util/getTimestamp')

const scenario = {
  name: 'WBTC/USDC',
  underlyingAssetSymbol: 'WBTC',
  underlyingAssetDecimals: 8,
  strikeAssetSymbol: 'USDC',
  strikeAssetDecimals: 6,
  strikePrice: ethers.BigNumber.from(5000e6.toString()),
  strikePriceDecimals: 6,
  expirationDate: 900000,
  amountToMint: ethers.BigNumber.from(1e8.toString()),
  amountToMintTooLow: 1
}

const OPTION_TYPE_PUT = 0

async function main () {
  // 0 ) Set addresses
  const [owner, buyer] = await ethers.getSigners()
  const deployerAddress = await owner.getAddress()
  const buyerAddress = await buyer.getAddress()

  // 1) Deploy Factory
  const OptionFactory = await ethers.getContractFactory('OptionFactory')
  const factory = await OptionFactory.deploy()

  await factory.deployed()
  // 2) Deploy Uniswap

  // 3) Deploy mock tokens
  const MockERC20 = await ethers.getContractFactory('MintableERC20')

  const mockUnderlyingAsset = await MockERC20.deploy(scenario.underlyingAssetSymbol, scenario.underlyingAssetSymbol, scenario.underlyingAssetDecimals)
  const mockStrikeAsset = await MockERC20.deploy(scenario.strikeAssetSymbol, scenario.strikeAssetSymbol, scenario.strikeAssetDecimals)

  await mockUnderlyingAsset.deployed()
  await mockStrikeAsset.deployed()

  // 4) Mint some Strike Tokens (To mint) and some Underlying Tokens (to exercise)
  await mockStrikeAsset.mint(scenario.strikePrice.mul(10))
  await mockUnderlyingAsset.connect(buyer).mint(scenario.amountToMint.mul(10))

  // 5) Deploy new option serie
  const txIdNewOption = await factory.createOption(
    'pod:WBTC:USDC:5000:A',
    'pod:WBTC:USDC:5000:A',
    OPTION_TYPE_PUT,
    mockUnderlyingAsset.address,
    mockStrikeAsset.address,
    scenario.strikePrice,
    await getTimestamp() + 5 * 60 * 60 * 1000,
    mockUnderlyingAsset.address
  )

  let optionAddress
  const filterFrom = await factory.filters.OptionCreated(deployerAddress)
  const eventDetails = await factory.queryFilter(filterFrom, txIdNewOption.blockNumber, txIdNewOption.blockNumber)
  console.log('txId: ', txIdNewOption.hash)
  console.log('timestamp: ', new Date())
  await txIdNewOption.wait()
  if (eventDetails.length) {
    const { deployer, option } = eventDetails[0].args
    console.log('blockNumber: ', eventDetails[0].blockNumber)
    console.log('deployer: ', deployer)
    optionAddress = option
    console.log('option: ', optionAddress)
  } else {
    console.log('Something went wrong: No events found')
  }

  const OptionContract = await ethers.getContractAt('PodPut', optionAddress)

  await mockStrikeAsset.approve(optionAddress, (ethers.constants.MaxUint256).toString())
  const balanceBefore = await OptionContract.balanceOf(deployerAddress)
  console.log('option seller balance before mint', balanceBefore.toString())
  await OptionContract.mint(scenario.amountToMint)
  const balanceAfter = await OptionContract.balanceOf(deployerAddress)
  console.log('option seller balance after mint', balanceAfter.toString())
  await OptionContract.transfer(buyerAddress, scenario.amountToMint)

  const balanceBuyerAfterTransfer = await OptionContract.balanceOf(buyerAddress)
  const balanceSellerAfterTransfer = await OptionContract.balanceOf(deployerAddress)
  console.log('option seller balance after transfer', balanceSellerAfterTransfer.toString())
  console.log('option buyer balance after transfer', balanceBuyerAfterTransfer.toString())
  await mockUnderlyingAsset.connect(buyer).approve(optionAddress, (ethers.constants.MaxUint256).toString())
  try {
    await OptionContract.connect(buyer).exercise(scenario.amountToMint)
  } catch (err) {
    console.log('opa')
  }
  const balanceAfterExercise = await OptionContract.balanceOf(buyerAddress)
  console.log('option buyer balance after mint', balanceAfterExercise.toString())
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
