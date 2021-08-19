const { toBigNumber } = require('../../utils/utils')
const verifyContract = require('../utils/verify')
const { getDeployments } = require('../utils/deployment')
const validateAddress = require('../utils/validateAddress')

task('deployNewOptionAMMPool', 'Deploy a New AMM Pool')
  .addParam('option', 'Option address')
  .addParam('tokenb', 'What is the other token that will be in the pool')
  .addParam('initialiv', 'Initial IV to start the pool')
  .addOptionalParam('cap', 'The cap of tokenB liquidity to be added')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .addFlag('tenderly', 'if true, it should verify the contract after the deployment')
  .setAction(async ({ option, tokenb, initialiv, cap, verify, tenderly }, hre) => {
    console.log('----Start Deploy New Pool----')
    const numberOfConfirmations = hre.network.name === 'local' ? 1 : 2

    validateAddress(option, 'option')

    const [deployer] = await ethers.getSigners()
    const { ConfigurationManager: configurationManagerAddress, FeePoolBuilder, ...deployments } = getDeployments()

    const ConfigurationManager = await ethers.getContractAt('ConfigurationManager', configurationManagerAddress)
    const OptionAMMFactory = await ethers.getContractAt('OptionAMMFactory', await ConfigurationManager.getAMMFactory())
    const TokenB = await ethers.getContractAt('MintableERC20', deployments[tokenb])

    console.log(`Deploying from OptionAMMFactory: ${OptionAMMFactory.address}`)
    const txIdNewPool = await OptionAMMFactory.createPool(option, TokenB.address, initialiv)
    const txReceipt = await txIdNewPool.wait(numberOfConfirmations)

    console.log('txId: ', txIdNewPool.hash)

    const poolAddress = await getPoolCreated(txIdNewPool, option, ConfigurationManager)
    console.log('pool', poolAddress)

    console.log(`Pool deployed at: ${poolAddress}`)
    if (true) {
      if (cap != null && parseFloat(cap) > 0) {
        const capValue = toBigNumber(cap).mul(toBigNumber(10 ** await TokenB.decimals()))
        console.log(`Setting AMM Pool Cap to: ${capValue} ${await TokenB.symbol()} ...`)
        const capProvider = await ethers.getContractAt('CapProvider', await ConfigurationManager.getCapProvider())

        const tx = await capProvider.setCap(poolAddress, capValue)
        await tx.wait(numberOfConfirmations)
        console.log('Pool cap set!')
      }

      if (verify) {
        const pool = await ethers.getContractAt('OptionAMMPool', poolAddress)
        await verifyContract(hre, poolAddress, [
          option,
          TokenB.address,
          initialiv,
          await pool.configurationManager(),
          FeePoolBuilder
        ])

        const feePoolA = await ethers.getContractAt('FeePool', await pool.feePoolA())
        await verifyContract(hre, feePoolA.address, [
          await feePoolA.feeToken(),
          await feePoolA.feeValue(),
          await feePoolA.feeDecimals()
        ])
      }

      if (tenderly) {
        await hre.run('tenderlyPush', { name: 'OptionAMMPool', address: poolAddress })

        const pool = await ethers.getContractAt('OptionAMMPool', poolAddress)
        await hre.run('tenderlyPush', { name: 'FeePool', address: await pool.feePoolA() })
        await hre.run('tenderlyPush', { name: 'FeePool', address: await pool.feePoolB() })
      }

      console.log('----End Deploy New Pool----')
      return poolAddress
    } else {
      console.log('Something went wrong: No events found')
    }
  })

async function getPoolCreated (tx, option, configurationManager) {
  const optionAMMFactory = await ethers.getContractAt('OptionAMMFactory', await configurationManager.getAMMFactory())
  const registry = await ethers.getContractAt('OptionPoolRegistry', await configurationManager.getOptionPoolRegistry())
  const filter = await registry.filters.PoolSet(optionAMMFactory.address, option.address)
  const events = await registry.queryFilter(filter, tx.blockNumber, tx.blockNumber)

  const { pool } = events[0].args
  return pool
}
