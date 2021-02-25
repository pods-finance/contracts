const { ethers } = require('hardhat')
const { expect } = require('chai')

describe('ModuleStorage', () => {
  let ModuleStorageUser, moduleStorageUser

  before(async () => {
    ModuleStorageUser = await ethers.getContractFactory('ModuleStorageUser')
  })

  beforeEach(async () => {
    moduleStorageUser = await ModuleStorageUser.deploy()
  })

  it('returns no address zero when module is not set', async () => {
    const moduleName = ethers.utils.formatBytes32String('UNSETTED_MODULE')

    expect(await moduleStorageUser.getModule(moduleName))
      .to.equal(ethers.constants.AddressZero)
  })

  it('sets a module address correctly', async () => {
    const moduleName = ethers.utils.formatBytes32String('TOKEN_BURNER')
    const tokenBurnerAddress = '0x0000000000000000000000000000000000000001'

    await expect(moduleStorageUser.setTokenBurner(tokenBurnerAddress))
      .to.emit(moduleStorageUser , 'ModuleSet')
      .withArgs(moduleName, tokenBurnerAddress)

    expect(await moduleStorageUser.getModule(moduleName))
      .to.equal(tokenBurnerAddress)
  })

  it('cannot set a zero address as module', async () => {
    await expect(moduleStorageUser.setTokenBurner(ethers.constants.AddressZero))
      .to.be.revertedWith('ModuleStorage: Invalid module')
  })
})
