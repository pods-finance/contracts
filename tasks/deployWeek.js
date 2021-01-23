const getTimestamp = require('../test/util/getTimestamp')
const fs = require('fs')
const path = require('path')
const fsPromises = fs.promises

internalTask('deployWeek', 'Deploy a whole local test environment')
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
        strike: 'AUSDC',
        underlying: 'WBTC',
        price: '36000'
      },
      {
        strike: 'USDC',
        underlying: 'WBTC',
        price: '38000'
      },
      {
        strike: 'USDC',
        underlying: 'WBTC',
        price: '40000'
      }
    ]

    const intervals = [2]
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
          initialsigma: '2000000000000000000' // 0.77%
        })

        console.log('start Flag: ', start)

        if (start) {
          // 7) Mint Options
          await run('mintOptions', { option: optionAddress, amount: '5' })

          // 8) Add Liquidity
          await run('addLiquidityAMM', {
            pooladdress: poolAddress,
            amounta: '5',
            amountb: '10000'
          })
        }
      }
    }
    console.log('deployedOptions:')
    console.log(deployedOptions)
  })
