const getTimestamp = require('../test/util/getTimestamp')
const fs = require('fs')
const path = require('path')
const fsPromises = fs.promises

task('deployWeek', 'Deploy a whole local test environment')
  .addFlag('start', 'add this flag if you want to start and mint the initial options and add liquidity')
  .setAction(async ({ start }, bre) => {
    const pathFile = `../deployments/${bre.network.name}.json`

    // 4) Deploy Test Option
    const currentBlockTimestamp = await getTimestamp()

    const _filePath = path.join(__dirname, pathFile)
    const content = await fsPromises.readFile(_filePath)
    const contentJSON = JSON.parse(content)

    const deployedOptions = []

    const options = [
      {
        strike: 'USDC',
        underlying: 'WETH',
        price: '1400'
      },
      {
        strike: 'DAI',
        underlying: 'WETH',
        price: '1500'
      },
      {
        strike: 'USDC',
        underlying: 'WBTC',
        price: '33000'
      }
    ]

    const intervals = [4]
    const oneDayInSeconds = 24 * 60 * 60

    for (const optionObj of options) {
      for (const interval of intervals) {
        const optionAddress = await run('deployNewOption', {
          strike: optionObj.strike,
          underlying: optionObj.underlying,
          price: optionObj.price,
          expiration: (currentBlockTimestamp + oneDayInSeconds * interval).toString()
        })
        const tokenbAddress = contentJSON[optionObj.strike]
        deployedOptions.push(optionAddress)

        // 5) Create AMMPool test with this asset
        const poolAddress = await run('deployNewOptionAMMPool', {
          option: optionAddress,
          tokenb: tokenbAddress,
          initialsigma: '2000000000000000000'
        })

        console.log('start Flag: ', start)

        if (start) {
          // 7) Mint Options
          await run('mintOptions', { option: optionAddress, amount: '10' })

          // 8) Add Liquidity
          await run('addLiquidityAMM', {
            pooladdress: poolAddress,
            amounta: '10',
            amountb: '50000'
          })
        }
      }
    }
    console.log('deployedOptions:')
    console.log(deployedOptions)
  })
