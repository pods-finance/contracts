/**
 * Aux function used to get Transaction Cost (Gas Used * Gas Price using Ethers.js)
 * @param {Object} tx its a ethers.js tx object
 * @returns {BigNumber} txCost
 */
async function getTxCost (tx) {
  const txReceipt = await tx.wait()
  const gasPrice = tx.gasPrice
  const gasUsed = txReceipt.gasUsed
  const txCost = gasPrice.mul(gasUsed)
  return txCost
}

module.exports = getTxCost
