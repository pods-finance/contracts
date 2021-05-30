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

    const tokensObj = {}
    const tokenList = [
      { name: 'Wrapped Ether', symbol: 'WETH', decimals: '18', weth: true },
      { name: 'USD Coin', symbol: 'USDC', decimals: '6' },
      { name: 'Aave Interest bearing USDC', symbol: 'aUSDC', decimals: '6' },
      { name: 'Dai Stablecoin', symbol: 'DAI', decimals: '18' },
      { name: 'Wrapped BTC', symbol: 'WBTC', decimals: '8' },
      { name: 'ChainLink Token', symbol: 'LINK', decimals: '18' }
    ]

    for (const tokenObj of tokensList) {
      const tokenAddress = await run('deployToken', tokenObj)
      tokensObj[tokenObj.symbol.toUpperCase()] = tokenAddress
    }

    await saveJSON(path, tokensObj)

    const configurationManagerAddress = await run('deployConfigurationManager')

    // 2) Setup Chainlink (Oracle) Mock
    const ChainlinkWBTCFeed = await ethers.getContractFactory('MockChainlinkFeed')

    const chainlinkWBTCFeed = await ChainlinkFeed.deploy(deployedTokens.WBTC, '8', '37170000000000')
    const chainlinkWETHFeed = await ChainlinkFeed.deploy(deployedTokens.WETH, '8', '1270000000000')
    const chainlinkLINKFeed = await ChainlinkFeed.deploy(deployedTokens.LINK, '8', '2496201073')

    await saveJSON(path, { wbtcChainlinkFeed: chainlinkWBTCFeed.address })

    // 3.2) Deploy BS + IV + AMMPoolFactory + Oracles
    await run('setAMMEnvironment', { asset: tokensObj.WBTC, source: chainlinkWBTCFeed.address, configuration: configurationManagerAddress, builders: true })

    // 3.3) Deploy Option Exchange
    const _filePath = pathJoin.join(__dirname, path)
    const content = await fsPromises.readFile(_filePath)

    // Set WETH price Provider
    const priceProvider = await ethers.getContractAt('PriceProvider', JSON.parse(content).PriceProvider)

    await priceProvider.setAssetFeeds([tokensObj.WETH], [chainlinkWETHFeed.address])
    await priceProvider.setAssetFeeds([tokensObj.LINK], [chainlinkLINKFeed.address])

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
      tokenb: tokensObj.USDC,
      initialiv: '770000000000000000', // 0.77%
      cap: '500000'
    })

    const optionAMMETHPoolAddress = await run('deployNewOptionAMMPool', {
      option: optionWETHAddress,
      tokenb: tokensObj.USDC,
      initialiv: '2000000000000000000',
      cap: '500000'
    })

    const optionLINKPoolAddress = await run('deployNewOptionAMMPool', {
      option: optionLINKAddress,
      tokenb: tokensObj.USDC,
      initialiv: '2311200000000000000',
      cap: '500000'
    })

    // 6) Mint Strike Asset
    console.log('Minting USDC strike asset')
    const mockUSDC = await ethers.getContractAt('MintableERC20', tokensObj.USDC)
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
