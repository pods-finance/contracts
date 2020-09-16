module.exports = async function getTimestamp () {
  const block = await ethers.provider.getBlock('latest')
  return block.timestamp
}
