const saveJSON = require('../utils/saveJSON')
const getTimestamp = require('../../test/util/getTimestamp')
const fs = require('fs')
const pathJoin = require('path')
const fsPromises = fs.promises

task('setupLocal', 'Deploy a whole local test environment')
  .setAction(async ({}, bre) => {
    const path = `../../deployments/${bre.network.name}.json`
    // Erasing local.json file
    await saveJSON(path, '', true)

    // 1) Setup mock assets
    const mockWETH = await run('deployToken', { name: 'weth', symbol: 'weth', decimals: '18', weth: true })

    const mockUSDC = await run('deployToken', { name: 'USDC Token', symbol: 'USDC', decimals: '6' })

    const mockAUSDC = await run('deployToken', { name: 'AUSDC Token', symbol: 'AUSDC', decimals: '6' })

    const mockDAI = await run('deployToken', { name: 'DAI Token', symbol: 'DAI', decimals: '18' })

    const mockWBTC = await run('deployToken', { name: 'Wrappeed BTC', symbol: 'WBTC', decimals: '8' })

    const mockLINK = await run('deployToken', { name: 'LINK Address', symbol: 'LINK', decimals: '18' })

    const tokensObj = {
      WETH: mockWETH.address,
      USDC: mockUSDC.address,
      AUSDC: mockAUSDC.address,
      DAI: mockDAI.address,
      WBTC: mockWBTC.address,
      LINK: mockLINK.address

    }
    await saveJSON(path, tokensObj)

    const configurationManagerAddress = await run('deployConfigurationManager')

    // 2) Setup Chainlink (Oracle) Mock
    const ChainlinkWBTCFeed = await ethers.getContractFactory('MockChainlinkFeed')

    const chainlinkWBTCFeed = await ChainlinkWBTCFeed.deploy(mockWBTC.address, '8', '37170000000000')
    const chainlinkWETHFeed = await ChainlinkWBTCFeed.deploy(mockWETH.address, '8', '1270000000000')
    const chainlinkLINKFeed = await ChainlinkWBTCFeed.deploy(mockLINK.address, '8', '2496201073')

    await saveJSON(path, { wbtcChainlinkFeed: chainlinkWBTCFeed.address })

    // 3.2) Deploy BS + Sigma + AMMPoolFactory + Oracles
    await run('setAMMEnvironment', { asset: mockWBTC.address, source: chainlinkWBTCFeed.address, configuration: configurationManagerAddress, builders: true })

    // 3.3) Deploy Option Exchange
    const _filePath = pathJoin.join(__dirname, path)
    const content = await fsPromises.readFile(_filePath)

    // Set WETH price Provider
    const priceProvider = await ethers.getContractAt('PriceProvider', JSON.parse(content).priceProvider)
    console.log('content.priceProvider', JSON.parse(content).priceProvider)

    await priceProvider.setAssetFeeds([mockWETH.address], [chainlinkWETHFeed.address])
    await priceProvider.setAssetFeeds([mockLINK.address], [chainlinkLINKFeed.address])

    const optionAMMFactory = JSON.parse(content).optionAMMFactory

    // 4) Deploy Test Option
    const currentBlockTimestamp = await getTimestamp()

    const optionWBTCAddress = await run('deployNewOption', {
      strike: 'USDC',
      underlying: 'WBTC',
      price: '18000',
      expiration: (currentBlockTimestamp + 48 * 60 * 60).toString(),
      cap: '2000'
    })

    const optionWETHAddress = await run('deployNewOption', {
      strike: 'USDC',
      underlying: 'WETH',
      price: '1500',
      expiration: (currentBlockTimestamp + 48 * 60 * 60).toString(),
      cap: '2000'
    })

    const optionLINKAddress = await run('deployNewOption', {
      strike: 'USDC',
      underlying: 'LINK',
      price: '25',
      expiration: (currentBlockTimestamp + 24 * 60 * 60 * 4).toString(),
      cap: '2000'
    })

    // 5) Create AMMPool test with this asset
    const optionAMMPoolAddress = await run('deployNewOptionAMMPool', {
      option: optionWBTCAddress,
      tokenb: mockUSDC.address,
      initialsigma: '770000000000000000', // 0.77%
      cap: '500000'
    })

    const optionAMMETHPoolAddress = await run('deployNewOptionAMMPool', {
      option: optionWETHAddress,
      tokenb: mockUSDC.address,
      initialsigma: '2000000000000000000',
      cap: '500000'
    })

    const optionLINKPoolAddress = await run('deployNewOptionAMMPool', {
      option: optionLINKAddress,
      tokenb: mockUSDC.address,
      initialsigma: '2311200000000000000',
      cap: '500000'
    })

    // 6) Mint Strike Asset
    console.log('Minting USDC strike asset')
    await mockUSDC.mint('10000000000000000')

    // 7) Mint Options
    await run('mintOptions', { option: optionLINKAddress, amount: '600' })

    // 8) Add Liquidity
    await run('addLiquidityAMM', {
      pooladdress: optionLINKPoolAddress,
      amounta: '500',
      amountb: '11000'
    })
  })
