pragma solidity ^0.6.8;

import "../interfaces/IPriceFeed.sol";
import "../interfaces/IChainlinkPriceFeed.sol";

contract ChainlinkPriceFeed is IPriceFeed {
    address public chainlinkFeedAddress;

    constructor(address _source) public {
        chainlinkFeedAddress = _source;
    }

    function getLatestPrice() external override view returns (int256) {
        (, int256 price, , , ) = IChainlinkPriceFeed(chainlinkFeedAddress).latestRoundData();
        return price;
    }
}
