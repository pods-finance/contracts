// SPDX-License-Identifier: agpl-3.0

pragma solidity >=0.6.12;

interface INormalDistribution {
    function getProbability(int256 z, uint256 decimals) external view returns (uint256);

    function setDataPoint(uint256 key, uint256 value) external;
}
