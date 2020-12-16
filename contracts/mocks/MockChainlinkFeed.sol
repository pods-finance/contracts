// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "../interfaces/IPriceFeed.sol";

contract MockChainlinkFeed is IPriceFeed {
    uint8 private _decimals;
    int256 private _currentPrice;
    uint256 private _updatedAt;
    address public assetFeed;

    constructor(
        address _assetFeed,
        uint8 _answerDecimals,
        int256 _initialPrice
    ) public {
        _decimals = _answerDecimals;
        _currentPrice = _initialPrice;
        assetFeed = _assetFeed;
        _updatedAt = block.timestamp;
    }

    function setPrice(int256 newPrice) external returns (int256) {
        _currentPrice = newPrice;
        _updatedAt = block.timestamp;
        return _currentPrice;
    }

    function getLatestPrice() external override view returns (int256) {
        return _currentPrice;
    }

    function latestRoundData()
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
        return (1, _currentPrice, 1, _updatedAt, uint80(_currentPrice));
    }

    function decimals() external override view returns (uint8) {
        return _decimals;
    }
}
