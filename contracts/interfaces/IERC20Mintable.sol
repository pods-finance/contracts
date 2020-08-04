// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

interface IERC20Mintable {
    function mint(uint256 amount) external returns (bool);

    function transfer(address recipient, uint256 amount) external returns (bool);

    function approve(address spender, uint256 amount) external returns (bool);

    function decimals() external returns (uint8);
}
