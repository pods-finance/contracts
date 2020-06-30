
// const getMonthLetter = require('../utils/utils.js')
const bre = require('@nomiclabs/buidler')
const factoryAddressKovan = '0x1d0Ca7d4A7c45c7b3E07CFbb90EcBe1e964B4296'

async function main () {
  // USDC Kovan: 0xe22da380ee6B445bb8273C81944ADEB6E8450422
  // WBTC Kovan: 0x0094e8cf72acf138578e399768879cedd1ddd33c

  const optionParams = {
    name: 'Pods Put WBTC USDC 5000 2020-06-23',
    symbol: 'podWBTC:20AA',
    optionType: 0,
    underlyingAsset: '0x0094e8cf72acf138578e399768879cedd1ddd33c',
    strikeAsset: '0xe22da380ee6B445bb8273C81944ADEB6E8450422',
    strikePrice: 5000000000, // 5000 USDC for 1 unit of WBTC,
    expirationDate: await ethers.provider.getBlockNumber() + 2000
  }

  const funcParameters = [
    optionParams.name,
    optionParams.symbol,
    optionParams.optionType,
    optionParams.underlyingAsset,
    optionParams.strikeAsset,
    optionParams.strikePrice,
    optionParams.expirationDate
  ]

  const [owner] = await ethers.getSigners()
  const deployerAddress = await owner.getAddress()

  // optionParams.symbol = `pod:${PodTokenParams.underlyingSymbol}:${PodTokenParams.strikeSymbol}:${PodTokenParams.strikePriceSymbol}:${getMonthLetter(PodTokenParams.maturityMonth)}`

  // optionParams.name = `pod:${PodTokenParams.underlyingSymbol}:${PodTokenParams.strikeSymbol}:${PodTokenParams.strikePriceSymbol}:${getMonthLetter(PodTokenParams.maturityMonth)}`

  const FactoryContract = await ethers.getContractAt('PodFactory', factoryAddressKovan)
  const txIdNewOption = await FactoryContract.createOption(...funcParameters)
  const filterFrom = await FactoryContract.filters.OptionCreated(deployerAddress)
  const eventDetails = await FactoryContract.queryFilter(filterFrom, txIdNewOption.blockNumber, txIdNewOption.blockNumber)

  if (eventDetails.length) {
    const { deployer, option, exchange } = eventDetails[0].args
    console.log('deployer: ', deployer)
    console.log('option: ', option)
    console.log('exchangeAddress: ', exchange)
  } else {
    console.log('Something went wrong: No events found')
  }

  // await FactoryContract.on('OptionCreated', (a, b, c, d, e) => {
  //   console.log(a, b, c, d, e)
  //   // The event object contains the verbatim log data, the
  //   // EventFragment and functions to fetch the block,
  //   // transaction and receipt and event functions
  // })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
