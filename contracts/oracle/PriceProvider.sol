// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IPriceFeed.sol";

/**
 * Storage of prices feeds by asset
 */
contract PriceProvider is Ownable {
    mapping(address => IPriceFeed) private _assetPriceFeeds;

    event AssetFeedUpdated(address indexed asset, address indexed feed);

    constructor(address[] memory _assets, address[] memory _feeds) public {
        _setAssetFeeds(_assets, _feeds);
    }

    /**
     * Register price feeds
     * @param _assets Array of assets
     * @param _feeds Array of price feeds
     */
    function setAssetFeeds(address[] memory _assets, address[] memory _feeds) external onlyOwner {
        _setAssetFeeds(_assets, _feeds);
    }

    /**
     * Gets the current price of an asset
     * @param _asset Address of an asset
     * @return Current price
     */
    function getAssetPrice(address _asset) external view returns (int256) {
        IPriceFeed feed = _assetPriceFeeds[_asset];
        require(address(feed) != address(0), "Feed not registered");

        return feed.getLatestPrice();
    }

    /**
     * Gets the number of decimals of a PriceFeed
     * @param _asset Address of an asset
     * @return Price decimals
     */
    function getAssetDecimals(address _asset) external view returns (uint8) {
        IPriceFeed feed = _assetPriceFeeds[_asset];
        require(address(feed) != address(0), "Feed not registered");

        return feed.decimals();
    }

    /**
     * Get the address of a registered price feed
     * @param _asset Address of an asset
     * @return Price feed address
     */
    function getPriceFeed(address _asset) external view returns (address) {
        return address(_assetPriceFeeds[_asset]);
    }

    /**
     * Internal function to set price feeds for different assets
     * @param _assets Array of assets
     * @param _feeds Array of price feeds
     */
    function _setAssetFeeds(address[] memory _assets, address[] memory _feeds) internal {
        require(_assets.length == _feeds.length, "INCONSISTENT_PARAMS_LENGTH");
        for (uint256 i = 0; i < _assets.length; i++) {
            _assetPriceFeeds[_assets[i]] = IPriceFeed(_feeds[i]);
            emit AssetFeedUpdated(_assets[i], _feeds[i]);
        }
    }
}
