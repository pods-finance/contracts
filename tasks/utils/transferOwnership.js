task('transferOwnership', 'Transfers the ownership of a Ownable contract')
  .addParam('target', 'contract address')
  .addParam('to', 'new owner address')
  .setAction(async ({ target, to }) => {
    console.log(`---Transferring contract: ${target} to: ${to}---`)
    const contract = await ethers.getContractAt('Ownable', target)
    await contract.transferOwnership(to)
    console.log('---Done---')
  })
