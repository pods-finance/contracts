<p align="center"><img src="https://rob-myfiles.s3.amazonaws.com/Logo+Pill.png" width="280px"/></p>
<p align="center">Pods is a decentralized non-custodial options protocol on Ethereum. Read this <a href="https://medium.com/podsfinance/understanding-options-5c47004f4c4" target="_blank">article</a> if you want to learn more!.</p>

<p align="center">
<!-- <a href="https://circleci.com/gh/tree/master" style="text-decoration:none;">
    <img src="https://img.shields.io/circleci/project/github/.svg" alt='CI' />
  </a> -->
  <a href="https://docs.openzeppelin.com/">
    <img src="https://img.shields.io/badge/build with-Buidler-f9c937" alt="Build with Hardhat">
  </a>

  <a href="https://github.com/pods-finance/contracts/actions?query=workflow:test">
    <img src="https://github.com/pods-finance/contracts/workflows/test/badge.svg" alt="test"/>
  </a>
  
  <a href='https://coveralls.io/github/pods-finance/contracts-v2'>
    <img src='https://coveralls.io/repos/github/pods-finance/contracts-v2/badge.svg?t=1pF1aS' alt='Coverage Status' />
  </a>

  <a href="https://discord.com/channels/713910672525754459/713910672525754462">
    <img src="https://img.shields.io/discord/713910672525754459?logo=Discord" alt="discord Badge">
  </a>
  <a href="https://twitter.com/podsfinance">
    <img src="https://badgen.net/twitter/follow/podsfinance?icon=twitter" alt="twitter Badge">
  </a>
  
  
</p>


---

**Full Documentation at [docs.pods.finance](https://docs.pods.finance)**

## Table of Contents

 - [Documentation](#documentation)
 - [Compile](#compile)
 - [Contracts](#contracts)
 - [Development](#development)
 - [Testing](#testing)
 - [Maintainers](#maintainers)
 - [Contributing](#contributing)
 - [License](#license)

## Documentation

Check out our full documentation at [pods-finance.gitbook](https://pods-finance.gitbook.io/documentation/)

## Compile

```bash
$ yarn compile
```

## Contracts

Checkout our full addresses list [here](https://pods-finance.gitbook.io/documentation/integrating-pods/smart-contracts)


## Development



## Testing

```
yarn test
```

## Coverage

```
yarn coverage
```

## Running Locally

You will first need to run a local node in your machine. You can do that with Hardhat using:

```
npx hardhat node
```

After that, you can run our script responsible for deploying all our contracts with a default configuration. It will be created some initial options and pools with liquidity there.

```
npx hardhat setupLocal --network local
```

## Contributing

We highly encourage participation from the community to help shape the development of Pods. If you are interested in
contributing or have any questions, ping us on [Twitter](https://twitter.com/pods-finance) or [Discord](https://discord.com/channels/713910672525754459/725468404139556874);

We use [Yarn](https://yarnpkg.com/) as a dependency manager and [Hardhat](https://hardhat.org/)
as a development environment for compiling, testing, and deploying our contracts. The contracts were written in [Solidity v0.6.12](https://github.com/ethereum/solidity).

## Maintainers

 - **Guilherme Viana**
 [@ggviana](https://github.com/ggviana)
 [`gui@pods.finance`](mailto:gui@pods.finance)

 - **Robson Silva**
 [@Robsonsjre](https://github.com/Robsonsjre)
 [`rob@pods.finance`](mailto:rob@pods.finance)

## License

[AGPL-3](./blob/master/LICENSE)
