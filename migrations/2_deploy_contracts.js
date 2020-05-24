var PodToken = artifacts.require('./PodToken')
// var aPodToken = artifacts.require('../contracts/aPodToken')
const getMonthLetter = require('../utils/utils.js')

const PodTokenParams = {
  strikeAddress: '0xe22da380ee6B445bb8273C81944ADEB6E8450422',
  underlyingAddress: '0x3b92f58feD223E2cB1bCe4c286BD97e42f2A12EA',
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

module.exports = function (deployer, network) {
  console.log('network', network)
  deployer.deploy(PodToken, PodTokenParams.name, PodTokenParams.symbol, PodTokenParams.underlyingAddress, PodTokenParams.strikeAddress, PodTokenParams.strikePrice, PodTokenParams.expirationDate)

  // deployer.deploy(aPodToken, PodTokenParams.name, PodTokenParams.symbol, PodTokenParams.underlyingAddress, PodTokenParams.strikeAddress, PodTokenParams.strikePrice, PodTokenParams.expirationDate)
}
