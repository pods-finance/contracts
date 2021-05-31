internalTask('deployOptionBuilder', 'Deploy OptionBuilder')
  .addParam('optiontype', 'Eg: PodPut, WPodPut, PodCall, WPodCall')
  .addFlag('save', 'if true, it should save the contract address inside the deployments folder')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .setAction(async ({ optiontype, save, verify }, hre) => {
    switch (optiontype) {
      case 'PodPut':
      case 'WPodPut':
      case 'PodCall':
      case 'WPodCall':
        const contractName = optiontype + 'Builder'

        return await hre.run('deploy', {
          name: contractName,
          save,
          verify
        })
      default:
        throw new Error('Builder not found! Available Builders: PodPut, WPodPut, PodCall, WPodCall')
    }
  })
