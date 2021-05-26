const path = require('path')
const fs = require('fs')

/**
 * Get addresses from a deployment file
 * @param {string} [network] Specify a network file. Defaults to hardhat current network
 */
module.exports.getDeployment = function getDeployment (network) {
  let filePath, deployment

  if (!network) {
    const hardhat = require('hardhat')
    network = hardhat.network.name
  }

  try {
    filePath = path.join(__dirname, `../../deployments/${network}.json`)
    deployment = require(filePath)
  } catch (e) {
    console.error(`Deployment file not found! Received: ${network}`)
    process.exit(1)
  }

  return deployment
}

/**
 * Saves the contracts in a deployment file
 * @param {Object} contracts Hashmap of contracts to save
 * @param {string} [network] Specify a network file. Defaults to hardhat current network
 */
module.exports.saveDeployment = async function saveDeployment (contracts, network) {
  let filePath, deployment

  if (!network) {
    const hardhat = require('hardhat')
    network = hardhat.network.name
  }

  try {
    filePath = path.join(__dirname, `../../deployments/${network}.json`)
    deployment = require(filePath)
  } catch (e) {
    console.error(`Deployment file not found! Received: ${network}`)
    process.exit(1)
  }

  const updated = Object.assign(deployment, contracts)
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2))
}

/**
 * Clear all contracts in a deployment file
 * @param {string} [network] Specify a network file. Defaults to hardhat current network
 */
module.exports.clearDeployment = async function clearDeployment (network) {
  let filePath

  if (!network) {
    const hardhat = require('hardhat')
    network = hardhat.network.name
  }

  try {
    filePath = path.join(__dirname, `../../deployments/${network}.json`)
  } catch (e) {
    console.error(`Deployment file not found! Received: ${network}`)
    process.exit(1)
  }

  fs.writeFileSync(filePath, JSON.stringify({}, null, 2))
}
