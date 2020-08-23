const BigNumber = require('bignumber.js')
require('./UniswapV1/getExchangeUniswapV1')

task('balance', "Prints an account's balance")
  .addParam('account', "The account's address")
  .addOptionalParam('erc20', 'Boolean if is ERC20')
  .setAction(async ({ account, erc20 }, bre) => {
    let balance
    const _account = web3.utils.toChecksumAddress(account)
    if (erc20) {
      console.log('erc20', erc20)
      const erc20Address = require(`../deployments/${bre.network.name}.json`)[erc20.toUpperCase()]
      //   ethers.Contract

      const ERC20Contract = await ethers.getContractAt('MockERC20', erc20Address)
      balance = await ERC20Contract.balanceOf(_account)
      const decimals = await ERC20Contract.decimals()
      console.log('decimals', decimals)
      console.log(balance.toString(), erc20)
      console.log(balance.div(ethers.BigNumber.from(10).pow(decimals)).toString(), erc20.toUpperCase())
    } else {
      balance = await web3.eth.getBalance(_account)
      console.log(web3.utils.fromWei(balance, 'ether'), 'ETH')
    }
  })
