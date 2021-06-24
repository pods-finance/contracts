const { getDeployments } = require('../utils/deployment')
const validateAddress = require('../utils/validateAddress')
const approveTransferERC20 = require('../utils/approveTransferERC20')

task('addLiquidityAMM', 'addLiquidityAMM')
  .addParam('option', 'The option address to add liquidity')
  .addOptionalParam('amounta', 'Amount of tokens A')
  .addParam('amountb', 'Amount of tokens B')
  .addOptionalParam('configuration', 'An address of a deployed ConfigurationManager, defaults to current `deployments` json file')
  .addOptionalParam('owner', 'Liquidity owner')
  .setAction(async ({ amounta, amountb, option, owner, configuration }, hre) => {
    const [caller] = await ethers.getSigners()
    const numberOfConfirmations = hre.network.name === 'local' ? 1 : 2

    if (!configuration) {
      const deployment = getDeployments()
      configuration = deployment.ConfigurationManager
    }

    if (!owner) {
      owner = caller.address
    }

    validateAddress(configuration, 'configuration')
    validateAddress(option, 'option')

    const configurationManager = await ethers.getContractAt('ConfigurationManager', configuration)
    const optionAMMFactory = await ethers.getContractAt('OptionAMMFactory', await configurationManager.getAMMFactory())

    const pool = await ethers.getContractAt('OptionAMMPool', await optionAMMFactory.getPool(option))
    const tokenA = await ethers.getContractAt('MintableERC20', await pool.tokenA())
    const tokenB = await ethers.getContractAt('MintableERC20', await pool.tokenB())

    const amountA = amounta
      ? ethers.BigNumber.from(amounta).mul(ethers.BigNumber.from(10).pow(await tokenA.decimals()))
      : await tokenA.balanceOf(caller.address)
    const amountB = ethers.BigNumber.from(amountb).mul(ethers.BigNumber.from(10).pow(await tokenB.decimals()))

    // Approve tokens to be added
    await approveTransferERC20(tokenA, pool.address, amountA, numberOfConfirmations)
    await approveTransferERC20(tokenB, pool.address, amountB, numberOfConfirmations)

    // Add liquidity per se
    const tx = await pool.addLiquidity(amountA, amountB, owner)
    await tx.wait(numberOfConfirmations)
    console.log(`Liquidity added to pool: ${pool.address}\nAmountA: ${amountA} ${await tokenA.symbol()}\nAmountB: ${amountB} ${await tokenB.symbol()}`)
  })
