const parseDuration = require('parse-duration')
const getTimestamp = require('../test/util/getTimestamp')
const fs = require('fs')
const path = require('path')
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

    const deployedOptions = []
    const options = [
      {
        strike: 'USDC',
        underlying: 'WETH',
        price: '2400',
        expiresIn: '7d'
      }
    ]

    for (const option of options) {
      const expiration = currentBlockTimestamp + (parseDuration(option.expiresIn) / 1000)

      const optionAddress = await hre.run('deployNewOption', {
        strike: option.strike,
        underlying: option.underlying,
        price: option.price,
        expiration: expiration.toString(),
        cap: '1000000000',
        verify,
        tenderly
      })

      const tokenbAddress = contentJSON[option.strike]
      deployedOptions.push(optionAddress)

      if (ivprovider) {
        const configurationManager = await ethers.getContractAt('ConfigurationManager', contentJSON.ConfigurationManager)
        const ivProviderAddress = await configurationManager.getIVProvider()
        const ivProvider = await ethers.getContractAt('IVProvider', ivProviderAddress)
        const tx = await ivProvider.updateIV(optionAddress, defaultInitialIV, '18')
        await tx.wait(2)
      }

      const poolAddress = await hre.run('deployNewOptionAMMPool', {
        option: optionAddress,
        tokenb: tokenbAddress,
        initialiv: defaultInitialIV,
        cap: '10000000000000000',
        verify,
        tenderly
      })

      console.log('Provide initial liquidity: ', start)

      if (start) {
        await hre.run('mintOptions', { option: optionAddress, amount: '5' })

        await hre.run('addLiquidityAMM', {
          pooladdress: poolAddress,
          amounta: '5',
          amountb: '10000'
        })
      }
    }
    console.log('deployedOptions:')
    console.log(deployedOptions)
  })
