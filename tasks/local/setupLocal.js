const saveJSON = require('../utils/saveJSON')
const getTimestamp = require('../../test/util/getTimestamp')
const fs = require('fs')
const pathJoin = require('path')
const fsPromises = fs.promises

task('setupLocal', 'Deploy a whole local test environment')
  .setAction(async ({}, hre) => {
    const path = `../../deployments/${hre.network.name}.json`
    // Erasing local.json file
    await saveJSON(path, '', true)

    // 1) Setup mock assets
    const mockWETHAddress = await hre.run('deployToken', { name: 'Wrapped Ether', symbol: 'WETH', decimals: '18', weth: true })

    const mockUSDCAddress = await hre.run('deployToken', { name: 'USD Coin', symbol: 'USDC', decimals: '6' })

    const mockAUSDCAddress = await hre.run('deployToken', { name: 'Aave Interest bearing USDC', symbol: 'aUSDC', decimals: '6' })

    const mockDAIAddress = await hre.run('deployToken', { name: 'Dai Stablecoin', symbol: 'DAI', decimals: '18' })

    const mockWBTCAddress = await hre.run('deployToken', { name: 'Wrapped BTC', symbol: 'WBTC', decimals: '8' })

    const mockLINKAddress = await hre.run('deployToken', { name: 'ChainLink Token', symbol: 'LINK', decimals: '18' })

    const tokensObj = {
      WETH: mockWETHAddress,
      USDC: mockUSDCAddress,
      AUSDC: mockAUSDCAddress,
      DAI: mockDAIAddress,
      WBTC: mockWBTCAddress,
      LINK: mockLINKAddress

    }
    await saveJSON(path, tokensObj)

    const configurationManagerAddress = await hre.run('deployConfigurationManager')

    // 2) Setup Chainlink (Oracle) Mock
    const ChainlinkWBTCFeed = await ethers.getContractFactory('MockChainlinkFeed')

    const chainlinkWBTCFeed = await ChainlinkWBTCFeed.deploy(mockWBTCAddress, '8', '37170000000000')
    const chainlinkWETHFeed = await ChainlinkWBTCFeed.deploy(mockWETHAddress, '8', '1270000000000')
    const chainlinkLINKFeed = await ChainlinkWBTCFeed.deploy(mockLINKAddress, '8', '2496201073')

    await saveJSON(path, { wbtcChainlinkFeed: chainlinkWBTCFeed.address })

    // 3.2) Deploy BS + IV + AMMPoolFactory + Oracles
    await run('setAMMEnvironment', { asset: mockWBTCAddress, source: chainlinkWBTCFeed.address, configuration: configurationManagerAddress, builders: true })

    // 3.3) Deploy Option Exchange
    const _filePath = pathJoin.join(__dirname, path)
    const content = await fsPromises.readFile(_filePath)

    const configurationManager = await ethers.getContractAt('ConfigurationManager', JSON.parse(content).ConfigurationManager)

    // Set WETH price Provider
    const priceProvider = await ethers.getContractAt('PriceProvider', await configurationManager.getPriceProvider())

    await priceProvider.setAssetFeeds([mockWETHAddress], [chainlinkWETHFeed.address])
    await priceProvider.setAssetFeeds([mockLINKAddress], [chainlinkLINKFeed.address])

    // 4) Deploy Test Option
    const currentBlockTimestamp = await getTimestamp()

    const optionWBTCAddress = await hre.run('deployNewOption', {
      strike: 'USDC',
      underlying: 'WBTC',
      price: '18000',
      expiration: (currentBlockTimestamp + 48 * 60 * 60).toString(),
      cap: '2000'
    })

    const optionWETHAddress = await hre.run('deployNewOption', {
      strike: 'USDC',
      underlying: 'WETH',
      price: '1500',
      expiration: (currentBlockTimestamp + 48 * 60 * 60).toString(),
      cap: '2000'
    })

    const optionLINKAddress = await hre.run('deployNewOption', {
      strike: 'USDC',
      underlying: 'LINK',
      price: '25',
      expiration: (currentBlockTimestamp + 24 * 60 * 60 * 4).toString(),
      cap: '2000'
    })

    // 5) Create AMMPool test with this asset
    const optionAMMPoolAddress = await hre.run('deployNewOptionAMMPool', {
      option: optionWBTCAddress,
      tokenb: mockUSDCAddress,
      initialiv: '770000000000000000', // 0.77%
      cap: '500000'
    })

    const optionAMMETHPoolAddress = await hre.run('deployNewOptionAMMPool', {
      option: optionWETHAddress,
      tokenb: mockUSDCAddress,
      initialiv: '2000000000000000000',
      cap: '500000'
    })

    const optionLINKPoolAddress = await hre.run('deployNewOptionAMMPool', {
      option: optionLINKAddress,
      tokenb: mockUSDCAddress,
      initialiv: '2311200000000000000',
      cap: '500000'
    })

    // 6) Mint Strike Asset
    console.log('Minting USDC strike asset')
    const mockUSDC = await ethers.getContractAt('MintableERC20', mockUSDCAddress)
    await mockUSDC.mint('10000000000000000')

    // // 7) Mint Options
    await hre.run('mintOptions', { option: optionLINKAddress, amount: '600' })

    // 8) Add Liquidity
    await hre.run('addLiquidityAMM', {
      pooladdress: optionLINKPoolAddress,
      amounta: '500',
      amountb: '11000'
    })
  })
