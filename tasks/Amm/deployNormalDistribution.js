
const saveJSON = require('../utils/saveJSON')

internalTask('deployNormalDistribution', 'Deploy Normal Distribution Contract')
  .setAction(async ({}, bre) => {
    console.log('----Start Deploy Normal Distribution----')
    const path = `../../deployments/${bre.network.name}.json`
    const NormalDistributionContract = await ethers.getContractFactory('NormalDistribution')
    const normalDistribution = await NormalDistributionContract.deploy()

    await normalDistribution.deployed()
    await saveJSON(path, { normalDistribution: normalDistribution.address })
    console.log('Normal Distribution Address', normalDistribution.address)
    return normalDistribution.address
  })
