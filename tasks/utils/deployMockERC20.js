const verifyContract = require('../utils/verify')

task('deployMockERC20', 'Deploy a new ERC20')
  .addParam('symbol', 'token symbol')
  .addParam('decimals', 'token decimals')
  .addOptionalParam('name', 'token name')
  .addFlag('verify', 'if want to verify the contract')
  .setAction(async ({ symbol, decimals, name, verify }, hre) => {
    console.log('----Start Deploy MOCKERC20----')
    const MockERC20Contract = await ethers.getContractFactory('MintableERC20')
    const erc20 = await MockERC20Contract.deploy(name || symbol, symbol, decimals)
    await erc20.deployed()

    if (verify) {
      const constructorElements = [name || symbol, symbol, decimals]
      console.log('constructorElements', constructorElements)
      await verifyContract(hre, erc20.address, constructorElements)
    }

    await erc20.deployed()
    console.log('ERC20 Address', erc20.address)
    return erc20.address
  })
