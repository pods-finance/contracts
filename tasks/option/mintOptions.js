
internalTask('mintOptions', 'Mint options')
  .addOptionalParam('optionContractName', 'Option Contract type to use')
  .addParam('optionAddress', 'Option address')
  .addParam('strikeAssetAddress', 'Strike Asset Address')
  .addParam('amount', 'Amount of Options to mint')
  .addParam('owner', 'Option owner')
  .setAction(async ({ optionAddress, strikeAssetAddress, owner, amount, optionContractName = 'PodPut' }) => {
    const strikeAssetContract = await ethers.getContractAt('MockERC20', strikeAssetAddress)
    const OptionContract = await ethers.getContractAt(optionContractName, optionAddress)

    console.log('Strike Asset', await strikeAssetContract.symbol())
    // 1) Approve StrikeAsset between me and option Contract
    await strikeAssetContract.approve(optionAddress, (ethers.constants.MaxUint256).toString())

    // 2) Call option Mint
    const txIdMint = await OptionContract.mint(amount, owner)
    await txIdMint.wait()
    console.log('Option Balance after mint', (await OptionContract.balanceOf(owner)).toString())
  })
