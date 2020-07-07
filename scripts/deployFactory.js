const bre = require('@nomiclabs/buidler')

async function main () {
  // await bre.run('compile');
  const PodFactory = await ethers.getContractFactory('PodFactory')
  const factory = await PodFactory.deploy()

  await factory.deployed()

  console.log('Factory deployed to:', factory.address)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
