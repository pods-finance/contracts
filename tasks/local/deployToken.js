internalTask('deployToken', 'Deploy a whole local test environment')
  .addOptionalParam('name', 'token name')
  .addOptionalParam('symbol', 'token symbol')
  .addOptionalParam('decimals', 'token decimals')
  .addFlag('weth', 'if the token is WETH')
  .setAction(async ({ name = 'Token', symbol = 'TKN', decimals = 18, weth }, bre) => {
    // 1) Setup fake assets
    const mockERC20 = await ethers.getContractFactory('MintableERC20')
    const mockWETH = await ethers.getContractFactory('WETH')
    let tokenAddress

    if (weth) {
      tokenAddress = await mockWETH.deploy()
    } else {
      tokenAddress = await mockERC20.deploy(name, symbol, decimals)
    }
    return tokenAddress
  })
