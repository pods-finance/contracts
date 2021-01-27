
const saveJSON = require('../utils/saveJSON')
const fs = require('fs')
const path = require('path')
const fsPromises = fs.promises

task('deployNewOptionAMMPool', 'Deploy a New AMM Pool')
  .addParam('option', 'Option address')
  .addParam('tokenb', 'What is the other token that will be in the pool')
  .addParam('initialsigma', 'Initial Sigma to start the pool')
  .setAction(async ({ option, tokenb, initialsigma }, bre) => {
    console.log('----Start Deploy New Pool----')
    const pathFile = `../../deployments/${bre.network.name}.json`
    const [owner] = await ethers.getSigners()
    const deployerAddress = await owner.getAddress()

    // 1) Create Option
    const _filePath = path.join(__dirname, pathFile)
    const content = await fsPromises.readFile(_filePath)
    const contentJSON = JSON.parse(content)

    const { optionAMMFactory, sigma, blackScholes, priceProvider } = contentJSON

    const OptionAMMFactory = await ethers.getContractAt('OptionAMMFactory', optionAMMFactory)

    const txIdNewPool = await OptionAMMFactory.createPool(option, tokenb, priceProvider, blackScholes, sigma, initialsigma)
    await txIdNewPool.wait()

    console.log('txId: ', txIdNewPool.hash)

    const filterFrom = await OptionAMMFactory.filters.PoolCreated(deployerAddress)
    const eventDetails = await OptionAMMFactory.queryFilter(filterFrom, txIdNewPool.blockNumber, txIdNewPool.blockNumber)
    if (eventDetails.length) {
      const { deployer, pool: poolAddress } = eventDetails[0].args
      console.log('blockNumber: ', eventDetails[0].blockNumber)
      console.log('deployer: ', deployer)
      console.log('pool: ', poolAddress)

      const poolObj = {
        option,
        tokenb,
        priceProvider,
        blackScholes,
        sigma,
        initialsigma
      }

      const currentPools = require(`../../deployments/${bre.network.name}.json`).pools
      const newPoolObj = Object.assign({}, currentPools, { [poolAddress]: poolObj })

      await saveJSON(pathFile, { pools: newPoolObj })
      console.log('----End Deploy New Pool----')
      return poolAddress
    } else {
      console.log('Something went wrong: No events found')
    }
  })
