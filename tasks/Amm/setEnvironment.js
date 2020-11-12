
const saveJSON = require('../utils/saveJSON')

internalTask('setEnvironment', 'Deploy deployOptionAMMFactory Contract')
  .addParam('asset', 'address of initial asset of the feed (e.g: WETH 0xD7FDf2747A855AC20b96A5cEDeA84b2138cEd280)')
  .addParam('source', 'address of the asset priceFeed (e.g: Chainlink 0x9326BFA02ADD2366b30bacB125260Af641031331')
  .setAction(async ({ asset, source }, bre) => {
    const path = `../../deployments/${bre.network.name}.json`
    const normalDistAddress = await run('deployNormalDistribution')

    const bsAddress = await run('deployBS', { normaldist: normalDistAddress, deploylibs: true })

    const sigmaAddress = await run('deploySigma', { bs: bsAddress })

    const priceProviderAddress = await run('deployOracle', { asset: asset, source: source })

    const ammFactoryAddress = await run('deployOptionAMMFactory')

    const objToSave = {
      blackScholes: bsAddress,
      sigma: sigmaAddress,
      priceProvider: priceProviderAddress,
      optionAMMFactory: ammFactoryAddress

    }
    await saveJSON(path, objToSave)

    console.log('---Finish Set New Environment----')
  })
