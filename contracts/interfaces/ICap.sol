// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface ICap {
    function setCap(address target, uint256 value) external;

    function getCap(address target) external view returns (uint256);
}
