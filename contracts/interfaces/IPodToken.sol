pragma solidity ^0.6.8;


interface IPodToken {
    function mint(uint256) external;

    function exchange(uint256) external;

    function withdraw(address) external;

    function strikeAsset() external view returns (address);

    function strikeAssetDecimals() external view returns (uint8 strikePriceDecimals);

    function underlyingAsset() external view returns (address);

    function underlyingAssetDecimals() external view returns (uint8 underlyingAssetDecimals);

    function strikePrice() external view returns (uint8 strikePrice);

    function strikePriceDecimals() external view returns (uint8 strikePriceDecimals);

    function lockedBalance(address) external view returns (uint256 lockedBalance);

    function expirationBlockNumber() external view returns (uint256);
}
