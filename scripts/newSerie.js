
const getMonthLetter = require('../utils/utils.js')
async function main () {
  // USDC Kovan: 0xe22da380ee6B445bb8273C81944ADEB6E8450422
  // WBTC Kovan: 0x3b92f58feD223E2cB1bCe4c286BD97e42f2A12EA
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

  //   const [deployer] = await ethers.getSigners()
  //   console.log(
  //     'Deploying contracts with the account:',
  //     await deployer.getAddress()
  //   )

  //   console.log('Account balance:', (await deployer.getBalance()).toString())

  // const Token = await ethers.getContractFactory('MockERC20')
  // const token = await Token.deploy('teste', 'testao', 8)

  //   const Token = await ethers.getContractFactory('PodToken')
  //   const token = await Token.deploy(PodTokenParams.name, PodTokenParams.symbol, PodTokenParams.underlyingAddress, PodTokenParams.strikeAddress, PodTokenParams.strikePrice, PodTokenParams.expirationDate)

  // await token.deployed()

  // console.log('Token address:', token.address)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
