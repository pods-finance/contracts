task('tenderlyPush', 'Push contracts to tenderly')
  .addParam('name', 'contracts name')
  .addParam('address', 'contracts address')
  .setAction(async ({ name, address }, hre) => {
    console.log('----Push Tenderly----')
    hre.config.tenderly.project = `Pods-${hre.network.name}`
    await hre.tenderly.push({ name, address })
  })
