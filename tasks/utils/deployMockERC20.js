
task('deployMockERC20', 'Deploy a new ERC20')
  .addParam('symbol', 'token symbol')
  .addParam('decimals', 'token decimals')
  .setAction(async ({ symbol, decimals }) => {
    console.log('----Start Deploy MOCKERC20----')
    const MockERC20Contract = await ethers.getContractFactory('MintableERC20')
    const erc20 = await MockERC20Contract.deploy(symbol, symbol, decimals)

    await erc20.deployed()
    console.log('ERC20 Address', erc20.address)
    return erc20.address
  })
