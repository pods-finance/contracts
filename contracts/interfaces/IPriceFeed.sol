// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

interface IPriceFeed {
    function getLatestPrice() external view returns (int256);

    function decimals() external view returns (uint8);
}
