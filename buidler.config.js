require('dotenv').config()
require('./tasks/utils/balance')
require('./tasks/deployNewSerie')
require('./tasks/deployOptionFactory')
require('./tasks/UniswapV1/getExchangeUniswapV1')
require('./tasks/deployOptionExchange')
require('./tasks/Balancer/index')

usePlugin('@nomiclabs/buidler-waffle')
usePlugin('@nomiclabs/buidler-web3')

module.exports = {
  networks: {
    development: {
      protocol: 'http',
      host: 'localhost',
      port: 8545,
      gas: 5000000,
      gasPrice: 5e9,
      network_id: '*',
      url: 'https://mainnet.infura.io/v3/' + process.env.INFURA_PROJECT_ID
    },
    ganache: {
      protocol: 'http',
      host: 'localhost',
      port: 7545,
      gas: 800,
      network_id: '5777',
      url: 'https://mainnet.infura.io/v3/' + process.env.INFURA_PROJECT_ID
    },
    kovan: {
      accounts: {
        mnemonic: process.env.DEV_MNEMONIC,
        initialIndex: 1,
        count: 1
      },
      url: 'https://kovan.infura.io/v3/' + process.env.INFURA_PROJECT_ID,
      network_id: 42
    }
  },
  solc: {
    version: '0.6.12',
    optimizer: {
      enabled: true,
      runs: 200
    }
  },
  mocha: {
    timeout: 20001
  }
}
