const parseDuration = require('parse-duration')
const getTimestamp = require('../test/util/getTimestamp')
const fs = require('fs')
const path = require('path')
const { getDeployments } = require('./utils/deployment')
const fsPromises = fs.promises

task('deployWeek', 'Deploy a whole local test environment')
  .addFlag('start', 'add this flag if you want to start and mint the initial options and add liquidity')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .addFlag('tenderly', 'if true, it should verify the contract after the deployment on tenderly')
  .addFlag('ivprovider', 'if true, it should add the option to the ivprovider')
  .setAction(async ({ start, verify, ivprovider, tenderly }, hre) => {
    const pathFile = `../deployments/${hre.network.name}.json`
    const currentBlockTimestamp = await getTimestamp()
    const defaultInitialIV = '1750000000000000000'

    const _filePath = path.join(__dirname, pathFile)
    const content = await fsPromises.readFile(_filePath)
    const contentJSON = JSON.parse(content)
    const deployments = getDeployments()

    const deployedOptions = []
    /*
      Expiration expressions are used to schedule options expirations
      For documentation see https://github.com/jkroso/parse-duration
    */
    const options = [
      // ITM
      {
        strike: 'USDC',
        underlying: 'ETH',
        price: '10',
        expiresIn: '4d',
        initialIV: '2000000000000000000',
        initialOptions: '5000',
        initialStable: '5000',
        optionCap: '1000000',
        poolCap: '100000'
      },
      {
        strike: 'USDC',
        underlying: 'ETH',
        price: '10',
        expiresIn: '15d',
        initialIV: '2000000000000000000',
        initialOptions: '5000',
        initialStable: '5000',
        optionCap: '1000000',
        poolCap: '100000'
      },
      {
        strike: 'USDC',
        underlying: 'ETH',
        price: '10',
        expiresIn: '3 months',
        initialIV: '2000000000000000000',
        initialOptions: '5000',
        initialStable: '5000',
        optionCap: '1000000',
        poolCap: '100000'
      },
      // OTM - Normal strike
      {
        strike: 'USDC',
        underlying: 'ETH',
        price: '20',
        expiresIn: '4d',
        initialIV: '2000000000000000000',
        initialOptions: '5000',
        initialStable: '5000',
        optionCap: '1000000',
        poolCap: '100000'
      },
      {
        strike: 'USDC',
        underlying: 'ETH',
        price: '20',
        expiresIn: '15d',
        initialIV: '2000000000000000000',
        initialOptions: '5000',
        initialStable: '5000',
        optionCap: '1000000',
        poolCap: '100000'
      },
      {
        strike: 'USDC',
        underlying: 'ETH',
        price: '20',
        expiresIn: '3 months',
        initialIV: '2000000000000000000',
        initialOptions: '5000',
        initialStable: '5000',
        optionCap: '1000000',
        poolCap: '100000'
      },
      // OTM - Interest-bearing strike
      {
        strike: 'AUSDC',
        underlying: 'ETH',
        price: '30',
        expiresIn: '4d',
        initialIV: '2000000000000000000',
        initialOptions: '5000',
        initialStable: '5000',
        optionCap: '1000000',
        poolCap: '100000'
      },
      {
        strike: 'AUSDC',
        underlying: 'ETH',
        price: '30',
        expiresIn: '15d',
        initialIV: '2000000000000000000',
        initialOptions: '5000',
        initialStable: '5000',
        optionCap: '1000000',
        poolCap: '100000'
      },
      {
        strike: 'AUSDC',
        underlying: 'ETH',
        price: '30',
        expiresIn: '3 months',
        initialIV: '2000000000000000000',
        initialOptions: '5000',
        initialStable: '5000',
        optionCap: '1000000',
        poolCap: '100000'
      },
      // OTM - Normal strike
      {
        strike: 'AUSDC',
        underlying: 'ETH',
        price: '30',
        expiresIn: '4d',
        initialIV: '2000000000000000000',
        initialOptions: '5000',
        initialStable: '5000',
        optionCap: '1000000',
        poolCap: '100000'
      },
      {
        strike: 'AUSDC',
        underlying: 'ETH',
        price: '30',
        expiresIn: '15d',
        initialIV: '2000000000000000000',
        initialOptions: '5000',
        initialStable: '5000',
        optionCap: '1000000',
        poolCap: '100000'
      },
      {
        strike: 'AUSDC',
        underlying: 'ETH',
        price: '30',
        expiresIn: '3 months',
        initialIV: '2000000000000000000',
        initialOptions: '5000',
        initialStable: '5000',
        optionCap: '1000000',
        poolCap: '100000'
      },{
        strike: 'AUSDC',
        underlying: 'WMATIC',
        price: '3500',
        expiresIn: '4d',
        initialIV: '2000000000000000000',
        initialOptions: '5000',
        initialStable: '5000',
        optionCap: '1000000',
        poolCap: '100000'
      },
      {
        strike: 'AUSDC',
        underlying: 'WMATIC',
        price: '3500',
        expiresIn: '15d',
        initialIV: '2000000000000000000',
        initialOptions: '5000',
        initialStable: '5000',
        optionCap: '1000000',
        poolCap: '100000'
      },
      {
        strike: 'AUSDC',
        underlying: 'WMATIC',
        price: '3500',
        expiresIn: '3 months',
        initialIV: '2000000000000000000',
        initialOptions: '5000',
        initialStable: '5000',
        optionCap: '1000000',
        poolCap: '100000'
      },
    ]

    for (const option of options) {
      let expiration

      // If option.expiresIn is an expression, interpret it, otherwise assume it
      if (typeof option.expiresIn === 'string') {
        expiration = currentBlockTimestamp + (parseDuration(option.expiresIn) / 1000)
      } else {
        expiration = option.expiresIn
      }

      const optionAddress = await hre.run('deployNewOption', {
        strike: option.strike,
        underlying: option.underlying,
        price: option.price,
        expiration: expiration.toString(),
        cap: option.optionCap,
        verify,
        tenderly,
        aave: false
      })

      deployedOptions.push(optionAddress)

      if (ivprovider) {
        const configurationManager = await ethers.getContractAt('ConfigurationManager', deployments.ConfigurationManager)
        const ivProvider = await ethers.getContractAt('IVProvider', await configurationManager.getIVProvider())
        const tx = await ivProvider.updateIV(optionAddress, option.initialIV, '18')
        await tx.wait(2)
      }

      await hre.run('deployNewOptionAMMPool', {
        option: optionAddress,
        tokenb: option.strike,
        cap: option.poolCap,
        initialiv: option.initialIV,
        verify,
        tenderly
      })

      console.log('Provide initial liquidity: ', start)

      if (start) {
        await hre.run('mintOptions', { option: optionAddress, amount: option.initialOptions })

        await hre.run('addLiquidityAMM', {
          option: optionAddress,
          amounta: option.initialOptions,
          amountb: '10000'
        })
      }
    }
    console.log('deployedOptions:')
    console.log(deployedOptions)
  })
