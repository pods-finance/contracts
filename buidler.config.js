require('dotenv').config()
require('./tasks/utils/balance')
require('./tasks/option/deployOptionFactory')
require('./tasks/deployOptionExchange')
require('./tasks/Amm/index')

usePlugin('@nomiclabs/buidler-waffle')
usePlugin('@nomiclabs/buidler-web3')
usePlugin('buidler-gas-reporter')
usePlugin('solidity-coverage')

module.exports = {
  networks: {
    buidlerevm: {
      gas: 119500000,
      blockGasLimit: 119500000,
      gasMultiplier: 2,
      loggingEnabled: !!(process.env.BUIDLER_LOGGING_ENABLED) || false
    },
    local: {
      protocol: 'http',
      host: 'localhost',
      port: 8545,
      gas: 800,
      loggingEnabled: true,
      network_id: '*',
      url: 'http://127.0.0.1:8545'
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
        initialIndex: parseInt(process.env.ADDRESS_INDEX),
        count: 1
      },
      url: 'https://kovan.infura.io/v3/' + process.env.INFURA_PROJECT_ID,
      network_id: 42
    },
    coverage: {
      url: 'http://localhost:8555'
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
    timeout: 20000000001
  },
  gasReporter: {
    currency: 'USD',
    enabled: !!(process.env.REPORT_GAS),
    coinmarketcap: process.env.ETHERSCAN_APIKEY
  }
}
