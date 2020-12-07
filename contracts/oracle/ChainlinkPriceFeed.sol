// SPDX-License-Identifier: MIT
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
        chainlinkFeedAddress = _source;
    }

    /**
     * @dev Get the latest price
     */
    function getLatestPrice() external override view returns (int256) {
        (, int256 price, , , ) = IChainlinkPriceFeed(chainlinkFeedAddress).latestRoundData();
        return price;
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
