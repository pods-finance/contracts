// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

interface ERC20Mintable {
    function mint(uint256) external returns (bool);

    function transfer(address, uint256) external;

    function approve(address, uint256) external;

    function decimals() external returns (uint8);
}
