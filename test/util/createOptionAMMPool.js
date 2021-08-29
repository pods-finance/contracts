const { ethers } = require('hardhat')

module.exports = async function createOptionAMMPool (option, { configurationManager, initialSigma, tokenB } = {}) {
  const optionAMMFactory = await ethers.getContractAt('OptionAMMFactory', await configurationManager.getAMMFactory())
  const registry = await ethers.getContractAt('OptionPoolRegistry', await configurationManager.getOptionPoolRegistry())

  const tx = await createOptionAMMPoolTx(option, { configurationManager, initialSigma, tokenB })

  const filter = await registry.filters.PoolSet(optionAMMFactory.address, option.address)
  const events = await registry.queryFilter(filter, tx.blockNumber, tx.blockNumber)

  const { pool } = events[0].args
  return await ethers.getContractAt('OptionAMMPool', pool)
}

async function createOptionAMMPoolTx (option, { configurationManager, initialSigma, tokenB } = {}) {
  if (!ethers.utils.isAddress(tokenB)) {
    tokenB = await option.strikeAsset()
  }

  if (!initialSigma) {
    initialSigma = '960000000000000000'
  }

  const ivProvider = await ethers.getContractAt('IVProvider', await configurationManager.getIVProvider())
  await ivProvider.updateIV(option.address, initialSigma, '18')

  const optionAMMFactory = await ethers.getContractAt('OptionAMMFactory', await configurationManager.getAMMFactory())
  const tx = optionAMMFactory.createPool(
    option.address,
    tokenB,
    initialSigma
  )

  return tx
}

module.exports.getTransaction = createOptionAMMPoolTx
