const { getDeployments } = require('../utils/deployment')
const validateAddress = require('../utils/validateAddress')

task('deployOptionFactory', 'Deploy OptionFactory')
  .addFlag('builders', 'true if want to deploy all builders combined')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .addOptionalParam('configuration', 'An address of a deployed ConfigurationManager, defaults to current `deployments` json file')
  .addOptionalParam('podputbuilder', 'podputbuilder contract address')
  .addOptionalParam('wpodputbuilder', 'wpodputbuilder contract address')
  .addOptionalParam('aavepodputbuilder', 'aavepodputbuilder contract address')
  .addOptionalParam('podcallbuilder', 'podcallbuilder contract address')
  .addOptionalParam('wpodcallbuilder', 'wpodcallbuilder contract address')
  .addOptionalParam('aavepodcallbuilder', 'aavepodcallbuilder contract address')
  .addOptionalParam('wethadapt', 'alternative weth address in case of other networks')
  .setAction(async ({
                      podputbuilder,
                      wpodputbuilder,
                      aavepodputbuilder,
                      podcallbuilder,
                      wpodcallbuilder,
                      aavepodcallbuilder,
                      configuration,
                      builders,
                      wethadapt,
                      verify
                    }, hre) => {
    const deployment = getDeployments()
    const wethAddress = wethadapt || deployment.WETH

    if (!configuration) {
      configuration = deployment.ConfigurationManager
    }

    validateAddress(configuration, 'configuration')

    if (builders) {
      console.log(`Deploying OptionBuilders...`)
      podputbuilder = await hre.run('deployOptionBuilder', { optiontype: 'PodPut', save: true, verify, quiet: true })
      wpodputbuilder = await hre.run('deployOptionBuilder', { optiontype: 'WPodPut', save: true, verify, quiet: true })
      aavepodputbuilder = await hre.run('deployOptionBuilder', { optiontype: 'AavePodPut', save: true, verify, quiet: true })
      podcallbuilder = await hre.run('deployOptionBuilder', { optiontype: 'PodCall', save: true, verify, quiet: true })
      wpodcallbuilder = await hre.run('deployOptionBuilder', { optiontype: 'WPodCall', save: true, verify, quiet: true })
      aavepodcallbuilder = await hre.run('deployOptionBuilder', { optiontype: 'AavePodCall', save: true, verify, quiet: true })
      console.log(`OptionBuilders deployed successfully!`)
    }

    const factoryAddress = await hre.run('deploy', {
      name: 'OptionFactory',
      args: [
        wethAddress,
        podputbuilder,
        wpodputbuilder,
        aavepodputbuilder,
        podcallbuilder,
        wpodcallbuilder,
        aavepodcallbuilder,
        configuration
      ],
      save: true,
      verify
    })

    return factoryAddress
  })
