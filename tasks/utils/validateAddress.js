/**
 * Validate addresses and throw error script otherwise
 * @param {string} address
 * @param {string} [name]
 */
module.exports = function validateAddress (address, name = 'address') {
  if (!ethers.utils.isAddress(address)) {
    throw new Error(`\`${name}\` is not an address. Received: ${address}`)
  }
}
