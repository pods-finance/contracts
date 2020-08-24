// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

interface IBFactory {
    function newBPool() external returns (address);

    function isBPool(address b) external view returns (bool);
}
