// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "./MintableERC20.sol";

contract MockWBTC is MintableERC20 {
    constructor() public MintableERC20("WBTC", "WBTC", 8) {}
}
