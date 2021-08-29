const { toBigNumber } = require('../../utils/utils')
const verifyContract = require('../utils/verify')
const getOptionContractName = require('../utils/getOptionContractName')
const BigNumber = require('bignumber.js')
const { getDeployments } = require('../utils/deployment')

task('deployNewOption', 'Deploy New Option')
  .addParam('underlying', 'symbol of underlying asset. (E.G: wbtc)')
  .addParam('strike', 'symbol of strike asset. (E.G: usdc)')
  .addParam('price', 'Units of strikeAsset in order to trade for 1 unit of underlying. (E.G: 7000)')
  .addParam('expiration', 'Unix Timestamp of the expiration')
  .addOptionalParam('cap', 'The cap of tokens to be minted')
  .addFlag('call', 'Add this flag if the option is a Call')
  .addFlag('american', 'Add this flag if the option is american')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .addFlag('tenderly', 'if true, it should verify the contract after the deployment')
  .addFlag('aave', 'if true, then creates a reward-compatible option')
  .setAction(async ({
                      underlying,
                      strike,
                      price,
                      expiration,
                      windowOfExercise,
                      cap,
                      call,
                      american,
                      verify,
                      tenderly,
                      aave = false
                    }, hre) => {
    console.log('----Start Deploy New Option----')
    const numberOfConfirmations = hre.network.name === 'local' ? 1 : 2

    const strikeAssetSymbol = strike.toUpperCase()
    const underlyingAssetSymbol = underlying.toUpperCase()

    const {
      ConfigurationManager: configurationManagerAddress,
      ...deployments
    } = getDeployments()

    const configurationManager = await ethers.getContractAt('ConfigurationManager', configurationManagerAddress)

    const [deployer] = await ethers.getSigners()
    const underlyingAsset = await ethers.getContractAt('MintableERC20', deployments[underlyingAssetSymbol])
    const strikeAsset = await ethers.getContractAt('MintableERC20', deployments[strikeAssetSymbol])
    const strikeDecimals = await strikeAsset.decimals()
    const strikePrice = BigNumber(
      price.toLocaleString('fullwide', { useGrouping: false })
    ).multipliedBy(BigNumber(10).pow(strikeDecimals))

    const optionParams = {
      name: `Pods ${call ? 'Call' : 'Put'} ${underlyingAssetSymbol}:${strikeAssetSymbol} ${price} ${new Date(expiration * 1000).toISOString().slice(0, 10)}`, // Pods Put WBTC:USDC 7000 2020-07-10
      symbol: `Pod${underlyingAssetSymbol}:${strikeAssetSymbol}`, // Pods Put WBTC:USDC 7000 2020-07-10
      optionType: call ? 1 : 0, // 0 for put, 1 for call
      exerciseType: american ? 1 : 0, // 0 for European, 1 for American
      underlyingAsset: underlyingAsset.address, // 0x0094e8cf72acf138578e399768879cedd1ddd33c
      strikeAsset: strikeAsset.address, // 0xe22da380ee6B445bb8273C81944ADEB6E8450422
      strikePrice: strikePrice.toString(), // 7000e6 if strike is USDC,
      expiration: expiration, // 19443856 = 10 july
      windowOfExercise: (60 * 60 * 24).toString() // 19443856 = 10 july
    }

    const funcParameters = [
      optionParams.name,
      optionParams.symbol,
      optionParams.optionType,
      optionParams.exerciseType,
      optionParams.underlyingAsset,
      optionParams.strikeAsset,
      optionParams.strikePrice,
      optionParams.expiration,
      optionParams.windowOfExercise,
      aave
    ]

    const OptionFactory = await ethers.getContractAt('OptionFactory', await configurationManager.getOptionFactory())

    console.log(`Deploying from OptionFactory: ${OptionFactory.address}`)
    console.log('Option Parameters')
    console.table(optionParams)
    const txIdNewOption = await OptionFactory.createOption(...funcParameters)
    const txReceipt = await txIdNewOption.wait(numberOfConfirmations)
    console.log('txId: ', txIdNewOption.hash)

    const filterFrom = await OptionFactory.filters.OptionCreated(deployer.address)
    const eventDetails = await OptionFactory.queryFilter(filterFrom, txReceipt.blockNumber, txReceipt.blockNumber)

    if (eventDetails.length) {
      const { option: optionAddress } = eventDetails[0].args
      console.log(`Option deployed at: ${optionAddress}`)

      if (cap != null && parseFloat(cap) > 0) {
        const capValue = toBigNumber(cap).mul(toBigNumber(10 ** await underlyingAsset.decimals()))
        console.log(`Setting Option Cap to: ${capValue} ${optionParams.symbol} ...`)

        const capProvider = await ethers.getContractAt('CapProvider', await configurationManager.getCapProvider())

        const tx = await capProvider.setCap(optionAddress, capValue)
        await tx.wait(numberOfConfirmations)
        console.log(`Option cap set!`)
      }

      if (verify) {
        const constructorArguments = [
          optionParams.name,
          optionParams.symbol,
          optionParams.exerciseType,
          optionParams.underlyingAsset,
          optionParams.strikeAsset,
          optionParams.strikePrice,
          optionParams.expiration,
          optionParams.windowOfExercise,
          configurationManagerAddress
        ]

        if (underlyingAssetSymbol.toUpperCase() === 'WETH' || underlyingAssetSymbol.toUpperCase() === 'WMATIC') {
          constructorArguments.splice(3, 1)
        }

        await verifyContract(hre, optionAddress, constructorArguments)
      }

      if (tenderly) {
        const optionType = call ? 'CALL' : 'PUT'
        const contractName = getOptionContractName(hre.network.name, underlyingAssetSymbol, optionType, aave)
        await hre.run('tenderlyPush', { name: contractName, address: optionAddress })
      }

      console.log('----Finish Deploy New Option----')
      return optionAddress
    } else {
      throw Error('Something went wrong: No events found')
    }
  })
