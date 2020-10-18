// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

interface IFeePool {
    function getFee() external view returns (uint256);

    function setFee(uint256 fee, uint8 decimals) external;

    function getFeeDecimals() external view returns (uint8);

    function getCollectable(uint256 amount) external view returns (uint256);

    function collect(uint256 amount) external;

    function withdraw(uint256 amount, address to) external;
}
