const saveJSON = require('../utils/saveJSON')
const { toBigNumber } = require('../../utils/utils')
const verifyContract = require('../utils/verify')

const fs = require('fs')
const path = require('path')
const fsPromises = fs.promises

task('deployNewOption', 'Deploy New Option')
  .addParam('underlying', 'symbol of underlying asset. (E.G: wbtc)')
  .addParam('strike', 'symbol of strike asset. (E.G: usdc)')
  .addParam('price', 'Units of strikeAsset in order to trade for 1 unit of underlying. (E.G: 7000)')
  .addParam('expiration', 'Unix Timestamp of the expiration')
  .addParam('cap', 'The cap of tokens to be minted')
  .addFlag('call', 'Add this flag if the option is a Call')
  .addFlag('american', 'Add this flag if the option is american')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .setAction(async ({ underlying, strike, price, expiration, windowOfExercise, cap, call, american, verify }, hre) => {
    console.log('----Start Deploy New Option----')
    const pathFile = `../../deployments/${hre.network.name}.json`
    const numberOfConfirmations = hre.network.name === 'local' ? 1 : 2

    const strikeAsset = strike.toUpperCase()
    const underlyingAsset = underlying.toUpperCase()

    const _filePath = path.join(__dirname, pathFile)
    const content = await fsPromises.readFile(_filePath)
    const contentJSON = JSON.parse(content)

    const strikeAssetAddress = contentJSON[strikeAsset]
    const underlyingAssetAddress = contentJSON[underlyingAsset]
    const optionFactoryAddress = contentJSON.optionFactory
    const configuratorManagerAddress = contentJSON.configurationManager

    const [owner] = await ethers.getSigners()
    const deployerAddress = await owner.getAddress()
    const underlyingAssetContract = await ethers.getContractAt('MintableERC20', underlyingAssetAddress)
    const strikeAssetContract = await ethers.getContractAt('MintableERC20', strikeAssetAddress)
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

    console.log('optionFactoryAddress', optionFactoryAddress)

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
    const txReceipt = await txIdNewOption.wait(numberOfConfirmations)
    console.log('txId: ', txIdNewOption.hash)

    const filterFrom = await FactoryContract.filters.OptionCreated(deployerAddress)

    console.log('txReceipt.blockNumber', txReceipt.blockNumber)
    const eventDetails = await FactoryContract.queryFilter(filterFrom, txReceipt.blockNumber, 'latest')
    console.log('txId: ', txIdNewOption.hash)
    console.log('timestamp: ', new Date())

    if (eventDetails.length) {
      const { deployer, option } = eventDetails[0].args
      console.log('blockNumber: ', eventDetails[0].blockNumber)
      console.log('deployer: ', deployer)
      console.log('option: ', option)

      const currentOptions = contentJSON.options
      const newOptionObj = Object.assign({}, currentOptions, { [option]: optionParams })

      if (cap != null && parseFloat(cap) > 0) {
        const configurationManager = await ethers.getContractAt('ConfigurationManager', await FactoryContract.configurationManager())
        const capProvider = await ethers.getContractAt('CapProvider', await configurationManager.getCapProvider())

        const capValue = toBigNumber(cap).mul(toBigNumber(10 ** await underlyingAssetContract.decimals()))
        const tx = await capProvider.setCap(option, capValue)
        await tx.wait(numberOfConfirmations)
        console.log(`Option cap set to: ${capValue} ${optionParams.symbol}`)
      }

      if (verify) {
        const constructorElements = [...funcParameters]
        constructorElements.splice(2, 1)
        constructorElements.push(configuratorManagerAddress)
        console.log('constructorElements', constructorElements)
        await verifyContract(hre, option, constructorElements)
      }

      console.log('----Finish Deploy New Option----')
      return option
    } else {
      console.log('Something went wrong: No events found')
      throw Error('Something went wrong: No events found')
    }
  })
