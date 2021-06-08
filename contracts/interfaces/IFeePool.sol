// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

interface IFeePool {
    struct Balance {
        uint256 shares;
        uint256 liability;
    }

    function setFee(uint256 feeBaseValue, uint8 decimals) external;

    function withdraw(address to, uint256 amount) external;

    function mint(address to, uint256 amount) external;

    function feeToken() external view returns (address);

    function feeValue() external view returns (uint256);

    function feeDecimals() external view returns (uint8);

    function getCollectable(uint256 amount, uint256 poolAmount) external view returns (uint256);

    function sharesOf(address owner) external view returns (uint256);

    function getWithdrawAmount(address owner, uint256 amountOfShares) external view returns (uint256, uint256);
}
