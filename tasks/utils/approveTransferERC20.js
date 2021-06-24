module.exports = async function approveTransferERC20 (contract, spender, amount, numberOfConfirmations = 2) {
  const [owner] = await ethers.getSigners()
  const ownerAddress = await owner.getAddress()
  const currentBalance = await contract.balanceOf(ownerAddress)
  const decimals = await contract.decimals()
  const toNumber = value => value.div(ethers.BigNumber.from(10).pow(decimals))

  if (currentBalance.lt(amount)) {
    console.error(`Not enough ${await contract.symbol()}!\nRequired: ${toNumber(amount)}\nCaller has: ${toNumber(currentBalance)}`)
    process.exit(1)
  }

  const allowance = await contract.allowance(ownerAddress, spender)

  if (allowance.lt(amount)) {
    const approve = await contract.approve(spender, amount.sub(allowance))
    await approve.wait(numberOfConfirmations)
  }
}
