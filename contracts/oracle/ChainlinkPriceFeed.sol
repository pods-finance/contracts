// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "../interfaces/IPriceFeed.sol";
import "../interfaces/IChainlinkPriceFeed.sol";

/**
 * @title ChainlinkPriceFeed
 * @author Pods Finance
 * @notice Facade to Chainlink Aggregators
 */
contract ChainlinkPriceFeed is IPriceFeed {
    address public chainlinkFeedAddress;

    constructor(address _source) public {
        require(_source != address(0), "ChainlinkPriceFeed: Invalid source");
        chainlinkFeedAddress = _source;
    }

    /**
     * @dev Get the latest price
     */
    function getLatestPrice() external override view returns (int256, uint256) {
        (, int256 price, , uint256 lastUpdate, ) = IChainlinkPriceFeed(chainlinkFeedAddress).latestRoundData();
        return (price, lastUpdate);
    }

    /**
     * @dev Get the latest round data
     */
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
        return IChainlinkPriceFeed(chainlinkFeedAddress).latestRoundData();
    }

    /**
     * @dev Get asset decimals
     */
    function decimals() external override view returns (uint8) {
        return IChainlinkPriceFeed(chainlinkFeedAddress).decimals();
    }
}
