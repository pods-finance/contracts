var PodToken = artifacts.require('./PodToken')
var aPodToken = artifacts.require('./aPodToken')
var MockERC20 = artifacts.require('./MockERC20')

const getMonthLetter = require('../utils/utils.js')

const PodTokenParams = {
  strikeAddress: '0xe22da380ee6B445bb8273C81944ADEB6E8450422',
  underlyingAddress: '0x1D77879843A507Ec1687cA7d06ED5e39bfb73fb4',
  underlyingSymbol: 'WBTC',
  strikeSymbol: 'USDC',
  strikePriceSymbol: 5000,
  strikePrice: 5000000000,
  strikePriceDecimals: 6,
  maturityMonth: 'Jun',
  expirationDate: 19691392
}

const PodTokenParams2 = {
  strikeAddress: '0x02f626c6ccb6d2ebc071c068dc1f02bf5693416a',
  underlyingAddress: '0x1D77879843A507Ec1687cA7d06ED5e39bfb73fb4',
  underlyingSymbol: 'WBTC',
  strikeSymbol: 'aUSDC',
  strikePriceSymbol: 5000,
  strikePrice: 5000000000,
  strikePriceDecimals: 6,
  maturityMonth: 'Jun',
  expirationDate: 19691392
}

PodTokenParams.symbol = `pod:${PodTokenParams.underlyingSymbol}:${PodTokenParams.strikeSymbol}:${PodTokenParams.strikePriceSymbol}:${getMonthLetter(PodTokenParams.maturityMonth)}`

PodTokenParams.name = `pod:${PodTokenParams.underlyingSymbol}:${PodTokenParams.strikeSymbol}:${PodTokenParams.strikePriceSymbol}:${getMonthLetter(PodTokenParams.maturityMonth)}`

PodTokenParams2.symbol = `pod:${PodTokenParams2.underlyingSymbol}:${PodTokenParams2.strikeSymbol}:${PodTokenParams.strikePriceSymbol}:${getMonthLetter(PodTokenParams.maturityMonth)}`

PodTokenParams2.name = `pod:${PodTokenParams2.underlyingSymbol}:${PodTokenParams2.strikeSymbol}:${PodTokenParams2.strikePriceSymbol}:${getMonthLetter(PodTokenParams.maturityMonth)}`

module.exports = function (deployer, network) {
  console.log('network', network)
  deployer.deploy(
    PodToken, PodTokenParams.name,
    PodTokenParams.symbol,
    PodTokenParams.underlyingAddress,
    PodTokenParams.strikeAddress,
    PodTokenParams.strikePrice,
    PodTokenParams.expirationDate
  )

  deployer.deploy(
    aPodToken,
    PodTokenParams2.name,
    PodTokenParams2.symbol,
    PodTokenParams2.underlyingAddress,
    PodTokenParams2.strikeAddress,
    PodTokenParams2.strikePrice,
    PodTokenParams2.expirationDate
  )

  // deployer.deploy(
  //   MockERC20,
  //   'Wrapped BTC',
  //   'WBTC',
  //   8,
  //   1000e8
  // )
}
