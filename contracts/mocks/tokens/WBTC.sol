// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "./MintableERC20.sol";

contract MockWBTC is MintableERC20 {
    constructor() public MintableERC20("WBTC", "WBTC", 8) {}
}
