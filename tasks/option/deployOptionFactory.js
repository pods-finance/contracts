const saveJSON = require('../utils/saveJSON')

task('deployOptionFactory', 'Deploy OptionFactory')
  .addFlag('builders', 'true if want to deploy all builders combined')
  .addOptionalParam('podputbuilder', 'podputbuilder contract address')
  .addOptionalParam('wpodputbuilder', 'wpodputbuilder contract address')
  .addOptionalParam('podcallbuilder', 'podcallbuilder contract address')
  .addOptionalParam('wpodcallbuilder', 'wpodcallbuilder contract address')
  .setAction(async ({ podputbuilder, wpodputbuilder, podcallbuilder, wpodcallbuilder, builders }, bre) => {
    const path = `../../deployments/${bre.network.name}.json`
    const wethAddress = require(`../../deployments/${bre.network.name}.json`).WETH

    if (builders) {
      podputbuilder = await run('deployBuilder', { optiontype: 'PodPut' })
      wpodputbuilder = await run('deployBuilder', { optiontype: 'WPodPut' })
      podcallbuilder = await run('deployBuilder', { optiontype: 'PodCall' })
      wpodcallbuilder = await run('deployBuilder', { optiontype: 'WPodCall' })
    }

    const OptionFactory = await ethers.getContractFactory('OptionFactory')
    const factory = await OptionFactory.deploy(
      wethAddress,
      podputbuilder,
      wpodputbuilder,
      podcallbuilder,
      wpodcallbuilder)

    await factory.deployed()

    await saveJSON(path, { OptionFactory: factory.address })

    console.log('OptionFactory deployed to: ', factory.address)
  })
