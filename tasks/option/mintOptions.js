
internalTask('mintOptions', 'Mint options')
  .addParam('option', 'Option address')
  .addParam('amount', 'Amount of Options to mint')
  .addOptionalParam('contract', 'Option Contract type to use')
  .addOptionalParam('owner', 'Option owner')
  .setAction(async ({ option, owner, amount, contract = 'PodPut' }, bre) => {
    if(!owner) {
      const [defaultOwner] = await bre.web3.eth.getAccounts()
      owner = defaultOwner
    }
    const optionContract = await ethers.getContractAt(contract, option)
    const strikeAssetContract = await ethers.getContractAt('MockERC20', await optionContract.strikeAsset())

    console.log('Strike Asset', await strikeAssetContract.symbol())
    // 1) Approve StrikeAsset between me and option Contract
    await strikeAssetContract.approve(option, (ethers.constants.MaxUint256).toString())

    // 2) Call option Mint
    const txIdMint = await optionContract.mint(amount, owner)
    await txIdMint.wait()
    console.log('Option Balance after mint', (await optionContract.balanceOf(owner)).toString())
  })
