// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IPriceFeed.sol";
import "../interfaces/IPriceProvider.sol";

/**
 * @title PriceProvider
 * @author Pods Finance
 * @notice Storage of prices feeds by asset
 */
contract PriceProvider is IPriceProvider, Ownable {
    /**
     * @dev Minimum price interval to accept a price feed
     * Defaulted to 3 hours and 10 minutes
     */
    uint256 public constant MIN_UPDATE_INTERVAL = 11100;

    /**
     * @dev Stores PriceFeed by asset address
     */
    mapping(address => IPriceFeed) private _assetPriceFeeds;

    event AssetFeedUpdated(address indexed asset, address indexed feed);
    event AssetFeedRemoved(address indexed asset, address indexed feed);

    constructor(address[] memory _assets, address[] memory _feeds) public {
        _setAssetFeeds(_assets, _feeds);
    }

    /**
     * @notice Register price feeds
     * @param _assets Array of assets
     * @param _feeds Array of price feeds
     */
    function setAssetFeeds(address[] memory _assets, address[] memory _feeds) external override onlyOwner {
        _setAssetFeeds(_assets, _feeds);
    }

    /**
     * @notice Unregister price feeds
     * @dev Will not remove unregistered assets
     * @param _assets Array of assets
     */
    function removeAssetFeeds(address[] memory _assets) external override onlyOwner {
        for (uint256 i = 0; i < _assets.length; i++) {
            address removedFeed = address(_assetPriceFeeds[_assets[i]]);

            if (removedFeed != address(0)) {
                delete _assetPriceFeeds[_assets[i]];
                emit AssetFeedRemoved(_assets[i], removedFeed);
            }
        }
    }

    /**
     * @notice Gets the current price of an asset
     * @param _asset Address of an asset
     * @return Current price
     */
    function getAssetPrice(address _asset) external override view returns (uint256) {
        IPriceFeed feed = _assetPriceFeeds[_asset];
        require(address(feed) != address(0), "PriceProvider: Feed not registered");
        (int256 price, uint256 updatedAt) = feed.getLatestPrice();
        require(!_isObsolete(updatedAt), "PriceProvider: stale PriceFeed");
        require(price > 0, "PriceProvider: Negative price");

        return uint256(price);
    }

    /**
     * @notice Get the data from the latest round.
     * @param _asset Address of an asset
     * @return roundId is the round ID from the aggregator for which the data was
     * retrieved combined with an phase to ensure that round IDs get larger as
     * time moves forward.
     * @return answer is the answer for the given round
     * @return startedAt is the timestamp when the round was started.
     * (Only some AggregatorV3Interface implementations return meaningful values)
     * @return updatedAt is the timestamp when the round last was updated (i.e.
     * answer was last computed)
     * @return answeredInRound is the round ID of the round in which the answer
     * was computed.
     */
    function latestRoundData(address _asset)
        external
        override
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        IPriceFeed feed = _assetPriceFeeds[_asset];
        require(address(feed) != address(0), "PriceProvider: Feed not registered");

        return feed.latestRoundData();
    }

    /**
     * @notice Gets the number of decimals of a PriceFeed
     * @param _asset Address of an asset
     * @return Asset price decimals
     */
    function getAssetDecimals(address _asset) external override view returns (uint8) {
        IPriceFeed feed = _assetPriceFeeds[_asset];
        require(address(feed) != address(0), "PriceProvider: Feed not registered");

        return feed.decimals();
    }

    /**
     * @notice Get the address of a registered price feed
     * @param _asset Address of an asset
     * @return Price feed address
     */
    function getPriceFeed(address _asset) external override view returns (address) {
        return address(_assetPriceFeeds[_asset]);
    }

    /**
     * @dev Internal function to set price feeds for different assets
     * @param _assets Array of assets
     * @param _feeds Array of price feeds
     */
    function _setAssetFeeds(address[] memory _assets, address[] memory _feeds) internal {
        require(_assets.length == _feeds.length, "PriceProvider: inconsistent params length");
        for (uint256 i = 0; i < _assets.length; i++) {
            IPriceFeed feed = IPriceFeed(_feeds[i]);
            require(address(feed) != address(0), "PriceProvider: invalid PriceFeed");

            (, , uint256 startedAt, uint256 updatedAt, ) = feed.latestRoundData();

            require(startedAt > 0, "PriceProvider: PriceFeed not started");
            require(!_isObsolete(updatedAt), "PriceProvider: stale PriceFeed");

            _assetPriceFeeds[_assets[i]] = feed;
            emit AssetFeedUpdated(_assets[i], _feeds[i]);
        }
    }

    /**
     * @dev Internal function to check if a given timestamp is obsolete
     * @param _timestamp The timestamp to check
     */
    function _isObsolete(uint256 _timestamp) internal view returns (bool) {
        return _timestamp < (block.timestamp - MIN_UPDATE_INTERVAL);
    }
}
