<p align="center"><img src="https://pods.finance/static/media/logo.6d17fe4f.png" width="280px"/></p>
<p align="center">Pods is a decentralized non-custodial options protocol on Ethereum. Read this <a href="https://medium.com/podsfinance/understanding-options-5c47004f4c4" target="_blank">article</a> if you want to learn more!.</p>

<p align="center">
<!-- <a href="https://circleci.com/gh/tree/master" style="text-decoration:none;">
    <img src="https://img.shields.io/circleci/project/github/.svg" alt='CI' />
  </a> -->
  <a href="https://docs.openzeppelin.com/">
    <img src="https://img.shields.io/badge/using-Buidler-f9c937" alt="Built with OpenZeppelin">
  </a>
  <a href="https://docs.openzeppelin.com/">
    <img src="https://img.shields.io/badge/build with-OpenZeppelin-3677FF" alt="Built with OpenZeppelin">
  </a>

  <a href="https://github.com/pods-finance/contracts/actions?query=workflow:test">
    <img src="https://github.com/pods-finance/contracts/workflows/test/badge.svg" alt="test"/>
  </a>
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/github/license/pods-finance/contracts" alt="License: MIT">
  </a>
  <a href="https://discord.com/channels/713910672525754459/713910672525754462">
    <img src="https://img.shields.io/discord/713910672525754459?logo=Discord" alt="Chat Badge">
  </a>
  <a href="https://twitter.com/podsfinance">
    <img src="https://badgen.net/twitter/follow/podsfinance" alt="twitter Badge">
  </a>
  
  
</p>


---

**Full Documentation at [pods-finance.gitbook](https://pods-finance.gitbook.io/documentation/)**

## Table of Contents

 - [Documentation](#documentation)
 - [Compile](#compile)
 - [Contracts](#contracts)
 - [Development](#development)
 - [Enviroment](#enviroment)
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

## Enviroment

Our development environment consists of the following:

-   Open Zeppelin Contracts - external contracts dependency
-   Buidler - Development Framework
-   Ethers plugins for Buidler
-   Waffle (using Mocha/Chai) - unit testing
-   Solhint - linter
-   Prettier-solidity-plugin - formatter
-   Solidity - Version ^0.6.8

## Development


### Lint

To lint all packages:

```bash
$ yarn lint
```

### Prettier

To run prettier on all packages:

```bash
$ yarn prettier
```

## Testing

```
yarn run test
```

## Contributing :raising_hand_woman:

We highly encourage participation from the community to help shape the development of Pods. If you are interested in
contributing or have any questions, ping us on [Twitter](https://twitter.com/pods-finance) or [Discord](https://discord.com/channels/713910672525754459/725468404139556874);

We use [Yarn](https://yarnpkg.com/) as a dependency manager and [Buidler](https://github.com/nomiclabs/buidler)
as a development environment for compiling, testing, and deploying our contracts. The contracts were written in [Solidity v0.6.8](https://github.com/ethereum/solidity).

## Maintainers

 - **Guilherme Viana**
 [@ggviana](https://github.com/ggviana)
 [`gui@pods.finance`](mailto:gui@pods.finance)

 - **Robson Silva**
 [@Robsonsjre](https://github.com/Robsonsjre)
 [`rob@pods.finance`](mailto:rob@pods.finance)

## License

[MIT](./blob/master/LICENSE)
