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
  .setAction(async ({
                      podputbuilder,
                      wpodputbuilder,
                      aavepodputbuilder,
                      podcallbuilder,
                      wpodcallbuilder,
                      aavepodcallbuilder,
                      configuration,
                      builders,
                      verify
                    }, hre) => {
    const deployment = getDeployments()

    if (!configuration) {
      configuration = deployment.ConfigurationManager
    }

    validateAddress(configuration, 'configuration')

    const configurationManager = await ethers.getContractAt('ConfigurationManager', configuration)
    const wrappedNetworkToken = await configurationManager.getParameter(ethers.utils.formatBytes32String('WRAPPED_NETWORK_TOKEN'))
    if (wrappedNetworkToken.eq(0)) {
      throw new Error(`\`WRAPPED_NETWORK_TOKEN\` parameter not set on ConfigurationManager(${configuration.address})`)
    }

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
