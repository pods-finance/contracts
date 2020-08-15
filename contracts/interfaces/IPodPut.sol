// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

interface IPodPut {
    function mint(uint256, address) external;

    function exchange(uint256) external;

    function withdraw(address) external;

    function unwind(uint256) external;

    function underlyingAsset() external view returns (address);

    function underlyingAssetDecimals() external view returns (uint8);

    function strikeAsset() external view returns (address);

    function strikeAssetDecimals() external view returns (uint8);

    function strikePrice() external view returns (uint256);

    function strikePriceDecimals() external view returns (uint8);

    function expirationBlockNumber() external view returns (uint256);

    function uniswapFactoryAddress() external view returns (address);

    function amountOfMintedOptions(uint256) external view returns (uint256);

    function strikeToTransfer(uint256) external view returns (uint256);

    function name() external view returns (string memory);

    function symbol() external view returns (string memory);

    function decimals() external view returns (uint8);

    function balanceOf(address) external view returns (uint256);

    function lockedBalance(address) external view returns (uint256);

    function underlyingBalance() external view returns (uint256);

    function strikeBalance() external view returns (uint256);

    function hasExpired() external view returns (bool);
}
