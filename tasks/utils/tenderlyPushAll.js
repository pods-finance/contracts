task('tenderlyPushAll', 'Deploy a generic contract given artifact name')
  .setAction(async ({ name, verify }, hre) => {
    console.log('----Start Deploy Contract----')
    const content = require(`../../deployments/${hre.network.name}.json`)
    const contracts = Object.keys(content)
      .filter(key => !['AUSDC', 'USDC', 'ADAI', 'DAI', 'WETH', 'WMATIC', 'WBTC', 'FaucetKovan', 'BlackScholes'].includes(key))
      .map(key => ({
        name: key,
        address: content[key]
      }))
    hre.config.tenderly.project = `Pods-${hre.network.name}`
    await hre.tenderly.push(...contracts)
  })
