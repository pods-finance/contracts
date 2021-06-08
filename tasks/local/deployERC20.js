internalTask('deployToken', 'Deploy a whole local test environment')
  .addOptionalParam('name', 'token name')
  .addOptionalParam('symbol', 'token symbol')
  .addOptionalParam('decimals', 'token decimals')
  .addFlag('weth', 'if the token is WETH')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .addFlag('save', 'if true, it should save the contract address inside the deployments folder')
  .setAction(async ({
      name = 'Token',
      symbol = 'TKN',
      decimals = 18,
      weth,
      save,
      verify
    },
    hre
  ) => {
    let tokenAddress

    if (weth) {
      tokenAddress = await hre.run('deploy', {
        name: 'WETH',
        save,
        verify
      })
    } else {
      tokenAddress = await hre.run('deploy', {
        name: 'MintableERC20',
        args: [name, symbol, decimals],
        save,
        verify
      })
    }

    return tokenAddress
  })
