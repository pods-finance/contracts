const takeSnapshot = async () => {
  try {
    const snapshotId = await ethers.provider.send('evm_snapshot')
    return snapshotId
  } catch (err) {
    return err
  }
}

const revertToSnapshot = async (id) => {
  try {
    const result = await ethers.provider.send('evm_revert', [id])
    return result
  } catch (err) {
    return err
  }
}

module.exports = {
  takeSnapshot,
  revertToSnapshot
}
