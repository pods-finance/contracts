const saveJSON = require('../utils/saveJSON')

task('deployNewOption', 'Deploy New Option')
  .addParam('underlying', 'symbol of underlying asset. (E.G: wbtc)')
  .addParam('strike', 'symbol of strike asset. (E.G: usdc)')
  .addParam('price', 'Units of strikeAsset in order to trade for 1 unit of underlying. (E.G: 7000)')
  .addParam('expiration', 'Unix Timestamp of the expiration')
  .addFlag('call', 'Add this flag if the option is a Call')
  .addFlag('american', 'Add this flag if the option is american')
  .setAction(async ({ underlying, strike, price, expiration, windowOfExercise, call, american }, bre) => {
    const path = `../../deployments/${bre.network.name}.json`

    const strikeAsset = strike.toUpperCase()
    const underlyingAsset = underlying.toUpperCase()

    const strikeAssetAddress = require(`../../deployments/${bre.network.name}.json`)[strikeAsset]
    const underlyingAssetAddress = require(`../../deployments/${bre.network.name}.json`)[underlyingAsset]
    const optionFactoryAddress = require(`../../deployments/${bre.network.name}.json`).OptionFactory

    const [owner] = await ethers.getSigners()
    const deployerAddress = await owner.getAddress()
    const strikeAssetContract = await ethers.getContractAt('MockERC20', strikeAssetAddress)
    const strikeDecimals = await strikeAssetContract.decimals()
    const strikePrice = ethers.BigNumber.from(price).mul(ethers.BigNumber.from(10).pow(strikeDecimals))

    const optionParams = {
      name: `Pods ${call ? 'Call' : 'Put'} ${underlyingAsset}:${strikeAsset} ${price} ${new Date(expiration * 1000).toISOString().slice(0, 10)}`, // Pods Put WBTC:USDC 7000 2020-07-10
      symbol: `Pod${underlyingAsset}:${strikeAsset}`, // Pods Put WBTC:USDC 7000 2020-07-10
      optionType: call ? 1 : 0, // 0 for put, 1 for call
      exerciseType: american ? 1 : 0, // 0 for European, 1 for American
      underlyingAsset: underlyingAssetAddress, // 0x0094e8cf72acf138578e399768879cedd1ddd33c
      strikeAsset: strikeAssetAddress, // 0xe22da380ee6B445bb8273C81944ADEB6E8450422
      strikePrice: strikePrice.toString(), // 7000e6 if strike is USDC,
      expiration: expiration, // 19443856 = 10 july
      windowOfExercise: (60 * 60 * 24).toString() // 19443856 = 10 july
    }

    console.log('Option Parameters')
    console.log(optionParams)

    const funcParameters = [
      optionParams.name,
      optionParams.symbol,
      optionParams.optionType,
      optionParams.exerciseType,
      optionParams.underlyingAsset,
      optionParams.strikeAsset,
      optionParams.strikePrice,
      optionParams.expiration,
      optionParams.windowOfExercise
    ]

    const FactoryContract = await ethers.getContractAt('OptionFactory', optionFactoryAddress)
    const txIdNewOption = await FactoryContract.createOption(...funcParameters)
    await txIdNewOption.wait()

    const filterFrom = await FactoryContract.filters.OptionCreated(deployerAddress)
    const eventDetails = await FactoryContract.queryFilter(filterFrom, txIdNewOption.blockNumber, txIdNewOption.blockNumber)
    console.log('txId: ', txIdNewOption.hash)
    console.log('timestamp: ', new Date())

    if (eventDetails.length) {
      const { deployer, option } = eventDetails[0].args
      console.log('blockNumber: ', eventDetails[0].blockNumber)
      console.log('deployer: ', deployer)
      console.log('option: ', option)

      const currentOptions = require(`../../deployments/${bre.network.name}.json`).options
      const newOptionObj = Object.assign({}, currentOptions, { [option]: optionParams })

      await saveJSON(path, { options: newOptionObj })

      return option
    } else {
      console.log('Something went wrong: No events found')
    }
  })
