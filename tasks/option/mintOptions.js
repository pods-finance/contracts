
internalTask('mintOptions', 'Mint options')
  .addParam('option', 'Option address')
  .addParam('amount', 'Amount of Options to mint')
  .addOptionalParam('contract', 'Option Contract type to use')
  .addOptionalParam('owner', 'Option owner')
  .setAction(async ({ option, owner, amount, contract = 'PodPut' }, bre) => {
    const [caller] = await ethers.getSigners()
    if(!owner) {
      owner = await caller.getAddress()
    }
    const optionContract = await ethers.getContractAt(contract, option)
    const strikeAssetContract = await ethers.getContractAt('MockERC20', await optionContract.strikeAsset())
    const strikeBalance = await strikeAssetContract.balanceOf(caller)
    const strikeToTransfer = await optionContract.strikeToTransfer(amount)

    if (strikeBalance.lt(strikeToTransfer)) {
      console.error(`Not enough ${await strikeAssetContract.symbol()}!\nRequired: ${strikeToTransfer}\nCaller has: ${strikeBalance}`)
      return
    }

    // 1) Approve StrikeAsset between me and option Contract
    await strikeAssetContract.approve(option, (ethers.constants.MaxUint256).toString())

    const optionsBefore = await optionContract.balanceOf(owner)

    // 2) Call option Mint
    const txIdMint = await optionContract.mint(amount, owner)
    await txIdMint.wait()

    const optionsAfter = await optionContract.balanceOf(owner)
    console.log(`Minted ${optionsAfter.sub(optionsBefore)} ${await optionContract.name()} to address: ${owner}`)
  })
