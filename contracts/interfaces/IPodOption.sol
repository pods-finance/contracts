// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface IPodOption {
    function underlyingAsset() external view returns (address);

    function underlyingAssetDecimals() external view returns (uint8);

    function strikeAsset() external view returns (address);

    function strikeAssetDecimals() external view returns (uint8);

    function strikePrice() external view returns (uint256);

    function strikePriceDecimals() external view returns (uint8);

    function expiration() external view returns (uint256);

    function optionType() external view returns (uint256);

    function endOfExerciseWindow() external view returns (uint256);

    function name() external view returns (string memory);

    function symbol() external view returns (string memory);

    function decimals() external view returns (uint8);

    function balanceOf(address) external view returns (uint256);

    function hasExpired() external view returns (bool);

    function isAfterExerciseWindow() external view returns (bool);
}
