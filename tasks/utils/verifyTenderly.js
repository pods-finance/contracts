task('tenderly', 'Deploy a generic contract given artifact name')
  .setAction(async ({ name, verify }, hre) => {
    console.log('----Start Deploy Contract----')
    const content = require(`../../${hre.network.name}.json`)
    const contracts = Object.keys(content)
      .filter(key => !['AUSDC', 'USDC', 'ADAI', 'DAI', 'WETH', 'WMATIC', 'WBTC', 'BlackScholes'].includes(key))
      .map(key => ({
        name: key,
        address: content[key]
      }))

    await hre.tenderly.push(...contracts)
  })
