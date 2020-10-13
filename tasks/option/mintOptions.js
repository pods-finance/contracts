
internalTask('mintOptions', 'Mint options')
  .addOptionalParam('contract', 'Option Contract type to use')
  .addParam('option', 'Option address')
  .addParam('strike', 'Strike Asset Address')
  .addParam('amount', 'Amount of Options to mint')
  .addParam('owner', 'Option owner')
  .setAction(async ({ option, strike, owner, amount, contract = 'PodPut' }) => {
    const strikeAssetContract = await ethers.getContractAt('MockERC20', strike)
    const OptionContract = await ethers.getContractAt(contract, option)

    console.log('Strike Asset', await strikeAssetContract.symbol())
    // 1) Approve StrikeAsset between me and option Contract
    await strikeAssetContract.approve(option, (ethers.constants.MaxUint256).toString())

    // 2) Call option Mint
    const txIdMint = await OptionContract.mint(amount, owner)
    await txIdMint.wait()
    console.log('Option Balance after mint', (await OptionContract.balanceOf(owner)).toString())
  })
