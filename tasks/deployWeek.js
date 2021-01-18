const getTimestamp = require('../test/util/getTimestamp')
const fs = require('fs')
const path = require('path')
const fsPromises = fs.promises

internalTask('deployWeek', 'Deploy a whole local test environment')
  .setAction(async ({}, bre) => {
    const pathFile = `../deployments/${bre.network.name}.json`

    // 4) Deploy Test Option
    const currentBlockTimestamp = await getTimestamp()

    const _filePath = path.join(__dirname, pathFile)
    const content = await fsPromises.readFile(_filePath)
    const contentJSON = JSON.parse(content)

    const options = [
      {
        strike: 'USDC',
        underlying: 'MKR',
        price: '1000'
      },
      {
        strike: 'AUSDC',
        underlying: 'MKR',
        price: '1500'
      }
    ]

    const intervals = [1, 2]
    const oneDayInSeconds = 24 * 60 * 60

    for (const optionObj of options) {
      for (const interval of intervals) {
        const optionAddress = await run('deployNewOption', {
          strike: optionObj.strike,
          underlying: optionObj.underlying,
          price: optionObj.price,
          expiration: (currentBlockTimestamp + oneDayInSeconds * interval).toString()
        })
        const tokenbAddress = contentJSON[optionObj.underlying]

        // 5) Create AMMPool test with this asset
        await run('deployNewOptionAMMPool', {
          option: optionAddress,
          tokenb: tokenbAddress,
          initialsigma: '2000000000000000000' // 0.77%
        })
      }
    }

    // 6) Mint Strike Asset
    // console.log('Minting USDC strike asset')
    // await mockUSDC.mint('10000000000000000')

    // // 7) Mint Options
    // await run('mintOptions', { option: optionWBTCAddress, amount: '10000' })

    // // 8) Add Liquidity
    // await run('addLiquidityAMM', {
    //   pooladdress: optionAMMPoolAddress,
    //   amounta: '1000',
    //   amountb: '100000'
    // })
  })
