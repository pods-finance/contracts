internalTask('deployOptionBuilder', 'Deploy OptionBuilder')
  .addParam('optiontype', 'Eg: PodPut, WPodPut, AavePodPut, PodCall, WPodCall, AavePodCall')
  .addFlag('save', 'if true, it should save the contract address inside the deployments folder')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .addFlag('quiet', 'makes the deployment process less verbose')
  .setAction(async ({ optiontype, save, verify, quiet }, hre) => {
    switch (optiontype) {
      case 'PodPut':
      case 'WPodPut':
      case 'AavePodPut':
      case 'PodCall':
      case 'WPodCall':
      case 'AavePodCall':
        const contractName = optiontype + 'Builder'

        return await hre.run('deploy', {
          name: contractName,
          save,
          verify,
          quiet
        })
      default:
        throw new Error('Builder not found! Available Builders: PodPut, WPodPut, AavePodPut, PodCall, WPodCall, AavePodCall')
    }
  })
