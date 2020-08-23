const BigNumber = require('bignumber.js')
const UniswapFactoryABI = require('../abi/uniswap_factory.json')
const UniswapExchangeABI = require('../abi/uniswap_exchange.json')
const erc20ABI = require('../abi/erc20.json')
const { getBlockDate } = require('../utils/utils')
require('./UniswapV1/createExchangeUniswapV1')
require('./UniswapV1/addLiquidityUniswapV1')
require('./mintOptions')

task('deploySerie', 'Initial Option series setup: create option, create an exchange and add liquidity')
  .addParam('underlying', 'symbol of underlying asset. (E.G: wbtc)')
  .addParam('strike', 'symbol of strike asset. (E.G: usdc)')
  .addParam('price', 'Units of strikeAsset in order to trade for 1 unit of underlying. (E.G: 7000)')
  .addParam('expiration', 'Block number of the expiration')
  .addFlag('aave', 'if its Interest Bearing contract or not')
  .setAction(async ({ underlying, strike, price, expiration, aave }, bre) => {
    const optionFactoryNameAddress = aave ? 'aOptionFactory' : 'optionFactory'
    const optionFactoryContractName = aave ? 'aOptionFactory' : 'OptionFactory'
    let optionContractName
    const strikeAsset = strike.toUpperCase()
    const underlyingAsset = underlying.toUpperCase()

    if (aave) {
      if (underlyingAsset === 'WETH') {
        optionContractName = 'waPodPut'
      } else {
        optionContractName = 'aPodPut'
      }
    } else {
      if (underlyingAsset === 'WETH') {
        optionContractName = 'wPodPut'
      } else {
        optionContractName = 'PodPut'
      }
    }

    const strikeAssetAddress = require(`../deployments/${bre.network.name}.json`)[strikeAsset]
    const underlyingAssetAddress = require(`../deployments/${bre.network.name}.json`)[underlyingAsset]
    const optionFactoryAddress = require(`../deployments/${bre.network.name}.json`)[optionFactoryNameAddress]
    const { uniswapFactory } = require(`../deployments/${bre.network.name}.json`)

    const [owner] = await ethers.getSigners()
    const deployerAddress = await owner.getAddress()
    let optionAddress
    let txIdNewOption

    // TODO: function to build option name and symbol based on underyingAsset,strikeAsset,strikePrice and Date
    const currentBlockNumber = await ethers.provider.getBlockNumber()
    const expirationInDate = getBlockDate(currentBlockNumber, expiration, bre.network.config.network_id)

    const strikeAssetContract = new ethers.Contract(strikeAssetAddress, erc20ABI, owner)
    const strikeDecimals = await strikeAssetContract.decimals()
    const strikePrice = new BigNumber(price).multipliedBy(10 ** strikeDecimals).toString()

    const optionParams = {
      name: `Pods Put ${underlyingAsset}:${strikeAsset} ${price} ${expirationInDate.toISOString().slice(0, 10)}`, // Pods Put WBTC:USDC 7000 2020-07-10
      symbol: `pod${underlyingAsset}:${strikeAsset}`, // Pods Put WBTC:USDC 7000 2020-07-10
      optionType: 0, // 0 for put, 1 for call
      underlyingAsset: underlyingAssetAddress, // 0x0094e8cf72acf138578e399768879cedd1ddd33c
      strikeAsset: strikeAssetAddress, // 0xe22da380ee6B445bb8273C81944ADEB6E8450422
      strikePrice: strikePrice, // 7000e6 if strike is USDC,
      expirationDate: expiration // 19443856 = 10 july
    }

    console.log('Option Parameters')
    console.log(optionParams)

    const funcParameters = [
      optionParams.name,
      optionParams.symbol,
      optionParams.optionType,
      optionParams.underlyingAsset,
      optionParams.strikeAsset,
      optionParams.strikePrice,
      optionParams.expirationDate
    ]

    // 1) Create Option
    const FactoryContract = await ethers.getContractAt(optionFactoryContractName, optionFactoryAddress)

    console.log('Underlying Asset Symbol: ' + underlyingAsset)
    if (underlyingAsset === 'WETH') {
      funcParameters.splice(3, 1) // removing underlying asset
      txIdNewOption = await FactoryContract.createEthOption(...funcParameters)
    } else {
      txIdNewOption = await FactoryContract.createOption(...funcParameters)
    }
    const filterFrom = await FactoryContract.filters.OptionCreated(deployerAddress)
    const eventDetails = await FactoryContract.queryFilter(filterFrom, txIdNewOption.blockNumber, txIdNewOption.blockNumber)
    console.log('txId: ', txIdNewOption.hash)
    console.log('timestamp: ', new Date())
    await txIdNewOption.wait()
    if (eventDetails.length) {
      const { deployer, option } = eventDetails[0].args
      console.log('blockNumber: ', eventDetails[0].blockNumber)
      console.log('deployer: ', deployer)
      console.log('option: ', option)
      optionAddress = option
    } else {
      console.log('Something went wrong: No events found')
    }

    const OptionContract = await ethers.getContractAt(optionContractName, optionAddress)
    const optionDecimals = await OptionContract.decimals()
    console.log('optionDecimals: ', optionDecimals)

    // TODO: check price api, instead of hardcoded
    const currentEtherPriceInUSD = 225 // Checked on uniswap v1 usdc/eth pool
    const optionPremiumInUSD = 6
    const amountOfOptionsToMint = 10

    const optionPremiumInETH = optionPremiumInUSD / currentEtherPriceInUSD // currentEtherPriceInUSD / optionPremium
    const amountOfEthToAddLiquidity = new BigNumber(1e18).multipliedBy(optionPremiumInETH).multipliedBy(amountOfOptionsToMint).toString() // optionPremiumInETH * Amount
    // Amount * (10 ** optionDecimals)
    const amountOfOptionsToAddLiquidity = new BigNumber(amountOfOptionsToMint).multipliedBy(10 ** optionDecimals).toString()

    // 2) Create new Uniswap Exchange with OptionAddress
    await run('createExchangeUniswapV1', { token: optionAddress, factoryAddress: uniswapFactory, deployerAddress })

    // 3) Mint options
    await run('mintOptions', { optionAddress, strikeAssetAddress, amount: amountOfOptionsToAddLiquidity, owner: deployerAddress })

    // 4) Add Liquidity to Uniswap Exchange
    await run('addLiquidityUniswapV1', { token: optionAddress, amountOfTokens: amountOfOptionsToAddLiquidity, amountOfEth: amountOfEthToAddLiquidity, deployerAddress, factory: uniswapFactory })

    console.log('Option Balance after liquidity added', (await OptionContract.balanceOf(deployerAddress)).toString())
  })
