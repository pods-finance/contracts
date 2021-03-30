// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

interface IFeePool {
    struct Balance {
        uint256 shares;
        uint256 liability;
    }

    function setFee(uint256 value, uint8 decimals) external;

    function withdraw(address to, uint256 amount) external;

    function mint(address to, uint256 amount) external;

    function feeValue() external view returns (uint256);

    function feeDecimals() external view returns (uint8);

    function getCollectable(uint256 amount) external view returns (uint256);

    function sharesOf(address owner) external view returns (uint256);
}
