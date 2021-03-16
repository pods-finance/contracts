
const saveJSON = require('../utils/saveJSON')
const verifyContract = require('../utils/verify')

internalTask('deployNormalDistribution', 'Deploy Normal Distribution Contract')
  .addFlag('verify', 'if true, it should verify the contract after the deployment')
  .setAction(async ({ verify }, hre) => {
    console.log('----Start Deploy Normal Distribution----')
    const path = `../../deployments/${hre.network.name}.json`
    const NormalDistributionContract = await ethers.getContractFactory('NormalDistribution')
    const normalDistribution = await NormalDistributionContract.deploy()

    await normalDistribution.deployed()
    await saveJSON(path, { normalDistribution: normalDistribution.address })

    if (verify) {
      await verifyContract(hre, normalDistribution.address)
    }
    console.log('Normal Distribution Address', normalDistribution.address)
    return normalDistribution.address
  })
