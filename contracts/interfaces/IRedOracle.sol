// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

interface IRedOracle {
    function getPrice(string memory ticker) external view returns (uint256 price);
}
