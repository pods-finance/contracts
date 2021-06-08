const { expect } = require('chai')
const { ethers } = require('hardhat')
const { toBigNumber } = require('../../utils/utils')

describe.only('am3CRVWrap.sol', () => {
  let mockToken, wrapToken
  let minter, another, minterAddress, anotherAddress
  let MockERC20, WrapperToken

  before(async function () {
    [minter, another] = await ethers.getSigners()
    minterAddress = await minter.getAddress()
    anotherAddress = await another.getAddress()
  })

  beforeEach(async function () {
    ;[MockERC20, WrapperToken] = await Promise.all([
      ethers.getContractFactory('MintableERC20'),
      ethers.getContractFactory('Am3CRVWrap')
    ])

    mockToken = await MockERC20.deploy('MockToken', 'MKT', 18)
    mockToken.deployed()

    wrapToken = await WrapperToken.deploy(mockToken.address)
    await wrapToken.deployed()
  })

  it('should mint and unmint the same amount if nothing changed', async () => {
    // 1) Mint initial mockTokens
    await mockToken.connect(minter).mint('1000')

    // 2) Allow tokens to be spendable
    await mockToken.connect(minter).approve(wrapToken.address, ethers.constants.MaxUint256)

    // 3) mint
    await wrapToken.connect(minter).mint('1000')

    const amountOfTokens = await wrapToken.balanceOf(minterAddress)
    console.log('currentBalanceBefore', amountOfTokens.toString())

    // 4) unmint
    await wrapToken.connect(minter).unmint(amountOfTokens)
    const currentBalanceAfter = await mockToken.balanceOf(minterAddress)
    console.log('currentBalanceAfter', currentBalanceAfter.toString())
    expect(currentBalanceAfter).to.be.equal('1000')
  })

  it('should mint and unmint half of the amount', async () => {
    // 1) Mint initial mockTokens
    await mockToken.connect(minter).mint('1000')

    // 2) Allow tokens to be spendable
    await mockToken.connect(minter).approve(wrapToken.address, ethers.constants.MaxUint256)

    // 3) mint
    await wrapToken.connect(minter).mint('1000')

    const amountOfTokens = await wrapToken.balanceOf(minterAddress)
    console.log('currentBalanceBefore', amountOfTokens.toString())

    // 4) unmint
    await wrapToken.connect(minter).unmint(amountOfTokens.div(2))
    const currentBalanceAfter = await mockToken.balanceOf(minterAddress)
    console.log('currentBalanceAfter', currentBalanceAfter.toString())
    expect(currentBalanceAfter).to.be.equal('500')
  })

  it('Mixed Proportions - Should pay partially in different cRates', async () => {
    // 0) Mint initial mockTokens
    await mockToken.connect(minter).mint('1000')
    await mockToken.connect(another).mint('1000')

    // 1) Allow tokens to be spendable
    await mockToken.connect(minter).approve(wrapToken.address, ethers.constants.MaxUint256)
    await mockToken.connect(another).approve(wrapToken.address, ethers.constants.MaxUint256)

    // 2) mint
    await wrapToken.connect(minter).mint('1000')
    await wrapToken.connect(another).mint('1000')

    const amountOfTokensBuyer = await wrapToken.balanceOf(anotherAddress)

    // 3) send to buyer
    await wrapToken.connect(another).transfer(minterAddress, amountOfTokensBuyer.div(2))

    // 4) increase rate
    await wrapToken.connect(minter).setConversionRate('3')

    // 5) unmint
    const totalUSD = amountOfTokensBuyer.add(amountOfTokensBuyer.div(2))
    await wrapToken.connect(minter).unmint(totalUSD)
    const currentBalanceAfter = await mockToken.balanceOf(minterAddress)
    console.log('currentBalanceAfter', currentBalanceAfter.toString())
    expect(currentBalanceAfter).to.be.gt('1000')
    expect(currentBalanceAfter).to.be.lt('1500')
  })
})
