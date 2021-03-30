// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

interface ICapProvider {
    function setCap(address target, uint256 value) external;

    function getCap(address target) external view returns (uint256);
}
