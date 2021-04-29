const path = require('path')

require('dotenv').config({
  path: path.resolve(__dirname, '.env')
})

require('@nomiclabs/hardhat-ethers')
require('@nomiclabs/hardhat-waffle')
require('@nomiclabs/hardhat-web3')
require('@nomiclabs/hardhat-solhint')
require('@nomiclabs/hardhat-etherscan')

require('@tenderly/hardhat-tenderly')

require('hardhat-spdx-license-identifier')

require('hardhat-gas-reporter')
require('solidity-coverage')
require('hardhat-contract-sizer')

require('./tasks/index')
require('./tasks/utils/index')
require('./tasks/Amm/index')
require('./tasks/configuration/index')
require('./tasks/option/index')
require('./tasks/local/index')
require('./tasks/oracle/index')

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
    mainnet: {
      accounts: {
        mnemonic: process.env.DEV_MNEMONIC,
        initialIndex: parseInt(process.env.ADDRESS_INDEX),
        count: 1
      },
      url: 'https://mainnet.infura.io/v3/' + process.env.INFURA_PROJECT_ID,
      network_id: 1
    },
    goerli: {
      accounts: {
        mnemonic: process.env.DEV_MNEMONIC,
        initialIndex: parseInt(process.env.ADDRESS_INDEX)
      },
      url: 'https://goerli.infura.io/v3/' + process.env.INFURA_PROJECT_ID,
      network_id: 5
    },
    matic: {
      accounts: {
        mnemonic: process.env.DEV_MNEMONIC,
        initialIndex: parseInt(process.env.ADDRESS_INDEX),
        count: 1
      },
      url: 'https://rpc-mainnet.matic.network',
      network_id: 137
    },
    mumbai: {
      accounts: {
        mnemonic: process.env.DEV_MNEMONIC,
        initialIndex: parseInt(process.env.ADDRESS_INDEX),
        count: 1
      },
      url: 'https://rpc-mumbai.maticvigil.com',
      network_id: 80001,
      gasPrice: 1e9,
      gasLimit: 2100000
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
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_APIKEY
  },
  spdxLicenseIdentifier: {
    overwrite: true
  }
}
