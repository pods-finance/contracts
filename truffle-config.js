require('dotenv').config()

const HDWalletProvider = require('@truffle/hdwallet-provider')

module.exports = {
  networks: {
    development: {
      protocol: 'http',
      host: 'localhost',
      port: 8545,
      gas: 5000000,
      gasPrice: 5e9,
      network_id: '*'
    },
    ganache: {
      protocol: 'http',
      host: 'localhost',
      port: 7545,
      gas: 800,
      network_id: '5777'
    },
    mainnet: {
      provider: () =>
        new HDWalletProvider(
          process.env.DEV_MNEMONIC,
          'https://mainnet.infura.io/v3/' + process.env.INFURA_PROJECT_ID,
          process.env.ADDRESS_INDEX
        ),
      network_id: '1',
      gasPrice: 5e9
    },
    kovan: {
      provider: () =>
        new HDWalletProvider(
          process.env.DEV_MNEMONIC,
          'https://kovan.infura.io/v3/' + process.env.INFURA_PROJECT_ID,
          process.env.ADDRESS_INDEX
        ),
      network_id: 42
    },
    rinkeby: {
      provider: () =>
        new HDWalletProvider(
          process.env.DEV_MNEMONIC,
          'https://rinkeby.infura.io/v3/' + process.env.INFURA_PROJECT_ID,
          process.env.ADDRESS_INDEX
        ),
      network_id: 4,
      gasPrice: 3e9,
      gas: 10000000
    }
  },

  // Set default mocha options here, use special reporters etc.
  mocha: {
    // timeout: 100000
  },

  // Configure your compilers
  compilers: {
    solc: {
      version: '0.6.8' // Fetch exact version from solc-bin (default: truffle's version)
      // docker: true,        // Use "0.5.1" you've installed locally with docker (default: false)
      // settings: {          // See the solidity docs for advice about optimization and evmVersion
      //  optimizer: {
      //    enabled: false,
      //    runs: 200
      //  },
      //  evmVersion: "byzantium"
      // }
    }
  }
}
