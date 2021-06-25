const BigNumber = require('bignumber.js')
const parseDuration = require('parse-duration')
const getTimestamp = require('../../test/util/getTimestamp')
const {  getDeployments, saveDeployments, clearDeployments } = require('../utils/deployment')

task('setupLocal', 'Deploy a whole local test environment')
  .setAction(async ({}, hre) => {
    // Erasing local.json file
    await clearDeployments()
    const [deployer] = await ethers.getSigners()
    const deployerAddress = await deployer.getAddress()

    const deployedTokens = {}
    const tokenList = [
      { name: 'Wrapped Ether', symbol: 'WETH', decimals: '18', weth: true },
      { name: 'USD Coin', symbol: 'USDC', decimals: '6' },
      { name: 'Aave Interest bearing USDC', symbol: 'aUSDC', decimals: '6' },
      { name: 'Dai Stablecoin', symbol: 'DAI', decimals: '18' },
      { name: 'Wrapped BTC', symbol: 'WBTC', decimals: '8' },
      { name: 'ChainLink Token', symbol: 'LINK', decimals: '18' }
    ]

    for (const tokenObj of tokenList) {
      const tokenAddress = await run('deployToken', tokenObj)
      deployedTokens[tokenObj.symbol.toUpperCase()] = tokenAddress
    }

    await saveDeployments(deployedTokens)

    const configurationManagerAddress = await hre.run('deployConfigurationManager')

    // 2) Setup Chainlink (Oracle) Mock
    const ChainlinkFeed = await ethers.getContractFactory('MockChainlinkFeed')

    const chainlinkWBTCFeed = await ChainlinkFeed.deploy(deployedTokens.WBTC, '8', '3717000000000')
    const chainlinkWETHFeed = await ChainlinkFeed.deploy(deployedTokens.WETH, '8', '254000000000')
    const chainlinkLINKFeed = await ChainlinkFeed.deploy(deployedTokens.LINK, '8', '2496201073')

    await saveDeployments({ wbtcChainlinkFeed: chainlinkWBTCFeed.address })

    // 3.2) Deploy BS + IV + AMMPoolFactory + Oracles
    await run('setAMMEnvironment', {
      asset: deployedTokens.WBTC,
      source: chainlinkWBTCFeed.address,
      configuration: configurationManagerAddress,
      builders: true
    })

    // 3.3) Deploy Option Exchange
    const deployments = getDeployments()

    const configurationManager = await ethers.getContractAt('ConfigurationManager', configurationManagerAddress)

    // Set WETH price Provider
    const priceProvider = await ethers.getContractAt('PriceProvider', await configurationManager.getPriceProvider())

    await priceProvider.setAssetFeeds([deployedTokens.WETH, deployedTokens.LINK], [chainlinkWETHFeed.address, chainlinkLINKFeed.address])

    const ivProviderAddress = await configurationManager.getIVProvider()
    const ivProvider = await ethers.getContractAt('IVProvider', ivProviderAddress)

    // Set the updater
    await ivProvider.setUpdater(deployerAddress)

    // 4) Deploy Test Option
    const currentBlockTimestamp = await getTimestamp()

    const optionsList = [
      {
        strike: 'USDC',
        underlying: 'WBTC',
        price: '38000',
        expiresIn: '20d',
        initialIV: '1800000000000000000',
        initialOptions: '10',
        initialStable: '500000',
        optionCap: '1000000',
        poolCap: '100000000000'
      },
      {
        strike: 'USDC',
        underlying: 'WETH',
        price: '2200',
        expiresIn: '15d',
        initialIV: '1760000000000000000',
        initialOptions: '6',
        initialStable: '11000',
        optionCap: '1000000',
        poolCap: '100000000000'
      },
      {
        strike: 'USDC',
        underlying: 'LINK',
        price: '25',
        expiresIn: '4d',
        initialIV: '2700000000000000000',
        initialOptions: '50',
        initialStable: '5000',
        optionCap: '1000000',
        poolCap: '10000000000000'
      }
    ]

    const deployedOptions = []

    for (const option of optionsList) {
      let expiration

      // If option.expiresIn is an expression, interpret it, otherwise assume it
      if (typeof option.expiresIn === 'string') {
        expiration = currentBlockTimestamp + (parseDuration(option.expiresIn) / 1000)
      } else {
        expiration = option.expiresIn
      }

      const optionAddress = await hre.run('deployNewOption', {
        strike: option.strike,
        underlying: option.underlying,
        price: option.price,
        expiration: expiration.toString(),
        cap: option.optionCap
      })

      const tokenbAddress = deployments[option.strike]
      deployedOptions.push(optionAddress)

      await ivProvider.updateIV(optionAddress, option.initialIV, '18')

      const poolAddress = await hre.run('deployNewOptionAMMPool', {
        option: optionAddress,
        tokenb: tokenbAddress,
        cap: option.poolCap,
        initialiv: option.initialIV
      })
      const mockToken = await ethers.getContractAt('MintableERC20', tokenbAddress)
      const mockTokenDecimals = await mockToken.decimals()
      const amountToMint = BigNumber(option.poolCap).times(BigNumber(10).pow(mockTokenDecimals))
      console.log('amountToMint')
      console.log(amountToMint.toString())

      await mockToken.mint(amountToMint.toString())

      if (option.initialOptions) {
        await hre.run('mintOptions', { option: optionAddress, amount: option.initialOptions })

        await hre.run('addLiquidityAMM', {
          pooladdress: poolAddress,
          amounta: option.initialOptions,
          amountb: option.initialStable
        })
      }
    }
    console.log('deployedOptions:')
    console.log(deployedOptions)
    console.log('---Finish Setup Local Network----')
  })
