
const saveJSON = require('../utils/saveJSON')
const fs = require('fs')
const path = require('path')
const fsPromises = fs.promises
const { toBigNumber } = require('../../utils/utils')
const verifyContract = require('../utils/verify')

task('deployNewOptionAMMPool', 'Deploy a New AMM Pool')
  .addParam('option', 'Option address')
  .addParam('tokenb', 'What is the other token that will be in the pool')
  .addParam('initialiv', 'Initial IV to start the pool')
  .addOptionalParam('cap', 'The cap of tokenB liquidity to be added')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .addFlag('tenderly', 'if true, it should verify the contract after the deployment')
  .setAction(async ({ option, tokenb, initialiv, cap, verify, tenderly }, hre) => {
    console.log('----Start Deploy New Pool----')
    const pathFile = `../../deployments/${hre.network.name}.json`
    const numberOfConfirmations = hre.network.name === 'local' ? 1 : 2

    const [owner] = await ethers.getSigners()
    const deployerAddress = await owner.getAddress()

    // 1) Create Option
    const _filePath = path.join(__dirname, pathFile)
    const content = await fsPromises.readFile(_filePath)
    const contentJSON = JSON.parse(content)

    const { ConfigurationManager: configurationManagerAddress } = contentJSON

    const configurationManager = await ethers.getContractAt('ConfigurationManager', configurationManagerAddress)
    const OptionAMMFactory = await ethers.getContractAt('OptionAMMFactory', await configurationManager.getAMMFactory())
    const tokenBContract = await ethers.getContractAt('MintableERC20', tokenb)

    const txIdNewPool = await OptionAMMFactory.createPool(option, tokenb, initialiv)
    const txReceipt = await txIdNewPool.wait(numberOfConfirmations)

    console.log('txId: ', txIdNewPool.hash)

    const filterFrom = await OptionAMMFactory.filters.PoolCreated(deployerAddress)
    const eventDetails = await OptionAMMFactory.queryFilter(filterFrom, txReceipt.blockNumber, 'latest')
    if (eventDetails.length) {
      const { deployer, pool: poolAddress } = eventDetails[0].args
      console.log('blockNumber: ', eventDetails[0].blockNumber)
      console.log('deployer: ', deployer)
      console.log('pool: ', poolAddress)

      const poolObj = {
        option,
        tokenb,
        initialiv
      }

      const currentPools = contentJSON.pools
      const newPoolObj = Object.assign({}, currentPools, { [poolAddress]: poolObj })

      if (cap != null && parseFloat(cap) > 0) {
        const capProvider = await ethers.getContractAt('CapProvider', await configurationManager.getCapProvider())

        const capValue = toBigNumber(cap).mul(toBigNumber(10 ** await tokenBContract.decimals()))
        const tx = await capProvider.setCap(poolAddress, capValue)
        await tx.wait(numberOfConfirmations)
        console.log(`Pool cap set to: ${capValue} ${await tokenBContract.symbol()}`)
      }

      if (verify) {
        const pool = await ethers.getContractAt('OptionAMMPool', poolAddress)
        const addressFeelTokenA = await pool.feePoolA()
        const addressFeelTokenB = await pool.feePoolB()
        const configuratorManager = await pool.configurationManager()

        const poolConstructorArguments = [
          option,
          tokenb,
          initialiv,
          configuratorManager,
          contentJSON.FeePoolBuilder
        ]

        await verifyContract(hre, poolAddress, poolConstructorArguments)

        const feePool = await ethers.getContractAt('FeePool', addressFeelTokenA)

        const feeConstructorArguments = [
          await feePool.feeToken(),
          await feePool.feeValue(),
          await feePool.feeDecimals()
        ]
        await verifyContract(hre, addressFeelTokenA, feeConstructorArguments)
      }

      if (tenderly) {
        await hre.run('tenderlyPush', { name: 'OptionAMMPool', address: poolAddress })

        const pool = await ethers.getContractAt('OptionAMMPool', poolAddress)
        const addressFeelTokenA = await pool.feePoolA()
        const addressFeelTokenB = await pool.feePoolB()

        await hre.run('tenderlyPush', { name: 'FeePool', address: addressFeelTokenA })

        await hre.run('tenderlyPush', { name: 'FeePool', address: addressFeelTokenB })
      }

      console.log('----End Deploy New Pool----')
      return poolAddress
    } else {
      console.log('Something went wrong: No events found')
    }
  })
