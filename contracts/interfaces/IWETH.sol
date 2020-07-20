// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

interface IWETH {
    function deposit() external payable;

    function withdraw(uint256 wad) external;

    function transfer(address recipient, uint256 amount) external returns (bool);
}
