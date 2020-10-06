// SPDX-License-Identifier: MIT
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../amm/AMM.sol";

contract MockAMM is AMM {
    using SafeMath for uint256;

    uint256 public price = 10**18;
    uint256 public amountTokensOut = 10**18;

    constructor(address _tokenA, address _tokenB) public AMM(_tokenA, _tokenB) {}

    function _getABPrice() internal override returns (uint256) {
        return price;
    }

    function _getTradeDetails(uint256 amountIn) internal override returns (TradeDetails memory) {
        TradeDetails memory tradeDetails = TradeDetails(amountTokensOut, bytes32(amountIn));
        return tradeDetails;
    }

    function _onTrade(TradeDetails memory) internal override {
        return;
    }

    function setPrice(uint256 _price) public {
        price = _price;
    }
}
