// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface INormalDistribution {
    function getProbability(int256 z, uint256 decimals) external view returns (int256);
}
