
const saveJSON = require('../utils/saveJSON')

internalTask('setEnvironment', 'Deploy deployOptionAMMFactory Contract')
  .addParam('asset', 'address of initial asset of the feed (e.g: WETH 0xD7FDf2747A855AC20b96A5cEDeA84b2138cEd280)')
  .addParam('source', 'address of the asset priceFeed (e.g: Chainlink 0x9326BFA02ADD2366b30bacB125260Af641031331')
  .setAction(async ({ asset, source }, bre) => {
    const path = `../../deployments/${bre.network.name}.json`

    await run('deployOptionAMMFactory')

    const normalDistAddress = await run('deployNormalDistribution')

    const bsAddress = await run('deployBS', { normaldist: normalDistAddress, deploylibs: true })

    await run('deploySigma', { bs: bsAddress })

    await run('deployOracle', { asset: asset, source: source })

    console.log('---Finish Set New Environment----')
  })
