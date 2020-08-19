const BigNumber = require('bignumber.js')
const UniswapFactoryABI = require('../abi/uniswap_factory.json')
const UniswapExchangeABI = require('../abi/uniswap_exchange.json')
const erc20ABI = require('../abi/erc20.json')
const { getBlockDate } = require('../utils/utils')

task('deploySerie', 'Initial Option series setup: create an option, create a uniswap exchange and add initial liquidity')
  .addParam('underlying', 'symbol of underlying asset. (E.G: wbtc)')
  .addParam('strike', 'symbol of strike asset. (E.G: usdc)')
  .addParam('price', 'Units of strikeAsset in order to trade for 1 unit of underlying. (E.G: 7000)')
  .addParam('expiration', 'Block number of the expiration')
  .setAction(async ({ underlying, strike, price, expiration }, bre) => {
    const strikeAsset = strike.toUpperCase()
    const underlyingAsset = underlying.toUpperCase()

    const strikeAssetAddress = require(`../deployments/${bre.network.name}.json`)[strikeAsset]
    const underlyingAssetAddress = require(`../deployments/${bre.network.name}.json`)[underlyingAsset]
    const { optionFactory, uniswapFactory } = require(`../deployments/${bre.network.name}.json`)
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
      expirationDate: expiration, // 19443856 = 10 july
      uniswapFactory
    }

    console.log('Optiion Parameters')
    console.log(optionParams)

    // TODO: check price api, instead of hardcoded
    const currentEtherPriceInUSD = 225 // Checked on uniswap v1 usdc/eth pool
    const optionPremiumInUSD = 6
    const amountOfOptionsToMint = 10

    const optionPremiumInETH = optionPremiumInUSD / currentEtherPriceInUSD // currentEtherPriceInUSD / optionPremium
    const amountOfEthToAddLiquidity = new BigNumber(1e18).multipliedBy(optionPremiumInETH).multipliedBy(amountOfOptionsToMint).toString() // optionPremiumInETH * Amount
    // Amount * (10 ** optionDecimals)

    const funcParameters = [
      optionParams.name,
      optionParams.symbol,
      optionParams.optionType,
      optionParams.underlyingAsset,
      optionParams.strikeAsset,
      optionParams.strikePrice,
      optionParams.expirationDate,
      optionParams.uniswapFactory
    ]

    // 1) Create Option
    const FactoryContract = await ethers.getContractAt('OptionFactory', optionFactory)
    const UnderlyingContract = new ethers.Contract(optionParams.underlyingAsset, erc20ABI, owner)
    const underlyingAssetSymbol = await UnderlyingContract.symbol()
    // const underlyingAssetSymbol = 'WETH'

    console.log('Underlying Asset Symbol: ' + underlyingAssetSymbol)
    if (underlyingAssetSymbol === 'WETH') {
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
    // 2) Create new Uniswap Exchange with OptionAddress
    console.log('Create New Uniswap Exchange')
    const UniswapFactoryContract = new web3.eth.Contract(UniswapFactoryABI, uniswapFactory)
    const txCreateExchange = await UniswapFactoryContract.methods.createExchange(optionAddress).send({ from: deployerAddress })
    setTimeout(() => 0, 5000)
    const optionExchangeAddress = await UniswapFactoryContract.methods.getExchange(optionAddress).call()
    console.log('optionExchangeAddress: ', optionExchangeAddress)

    // 3) Mint first Options
    const OptionContract = await ethers.getContractAt('PodPut', optionAddress)
    const ExchangeContract = new web3.eth.Contract(UniswapExchangeABI, optionExchangeAddress)

    // 3a) Approve StrikeAsset between me and option Contract

    console.log('Strike Asset', await strikeAssetContract.symbol())
    await strikeAssetContract.approve(optionAddress, (ethers.constants.MaxUint256).toString())

    // 3b) Call option Mint
    const optionDecimals = await OptionContract.decimals()
    console.log('optionDecimals: ', optionDecimals)
    const amountOfOptionsToAddLiquidity = new BigNumber(amountOfOptionsToMint).multipliedBy(10 ** optionDecimals).toString()
    const txIdMint = await OptionContract.mint(amountOfOptionsToAddLiquidity, deployerAddress)
    await txIdMint.wait()
    console.log('Option Balance after mint', (await OptionContract.balanceOf(deployerAddress)).toString())

    // 4) Add Liquidity to Uniswap Exchange
    // 4a) Approve Option contract to exchange spender
    const txIdApprove = await OptionContract.approve(optionExchangeAddress, (ethers.constants.MaxUint256).toString())
    await txIdApprove.wait()
    // // 4b) Add liquidity per se

    await ExchangeContract.methods.addLiquidity(0, amountOfOptionsToAddLiquidity, (ethers.constants.MaxUint256).toString()).send({ from: deployerAddress, value: amountOfEthToAddLiquidity })
    console.log('Liquidity Added')
    console.log('Option Balance after liquidity added', (await OptionContract.balanceOf(deployerAddress)).toString())
  })
