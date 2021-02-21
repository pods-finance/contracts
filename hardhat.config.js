require('dotenv').config()

require('./tasks/option/deployOptionFactory')
require('./tasks/deployOptionExchange')
require('./tasks/deployWeek')

require('./tasks/utils/index')
require('./tasks/Amm/index')
require('./tasks/configuration/index')
require('./tasks/option/index')
require('./tasks/local/index')
require('./tasks/oracle/index')

require('@nomiclabs/hardhat-ethers')
require('@nomiclabs/hardhat-waffle')
require('@nomiclabs/hardhat-web3')
require('@nomiclabs/hardhat-solhint')
require('hardhat-gas-reporter')
require('solidity-coverage')

module.exports = {
  networks: {
    hardhat: {
      loggingEnabled: !!(process.env.BUIDLER_LOGGING_ENABLED) || false,
      chainId: 1337,
      hardfork: 'istanbul'
    },
    local: {
      protocol: 'http',
      host: 'localhost',
      port: 8545,
      loggingEnabled: true,
      chainId: 1337,
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
  solidity: {
    version: '0.6.12',
    settings: {
      optimizer: {
        enabled: true
      }
    }
  },
  mocha: {
    timeout: 20000000001
  },
  gasReporter: {
    currency: 'USD',
    enabled: !!(process.env.REPORT_GAS)
  }
}
