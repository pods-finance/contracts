// SPDX-License-Identifier: agpl-3.0

// solhint-disable no-unused-vars
pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../amm/AMM.sol";

contract MockAMM is AMM {
    using SafeMath for uint256;

    uint256 public price = 10**18;
    uint256 public priceDecimals = 18;

    constructor(address _tokenA, address _tokenB) public AMM(_tokenA, _tokenB) {}

    function addLiquidity(
        uint256 amountOfA,
        uint256 amountOfB,
        address owner
    ) external override {
        return _addLiquidity(amountOfA, amountOfB, owner);
    }

    function removeLiquidity(uint256 amountOfA, uint256 amountOfB) external override {
        return _removeLiquidity(amountOfA, amountOfB);
    }

    function tradeExactAInput(
        uint256 exactAmountAIn,
        uint256 minAmountBOut,
        address owner
    ) external returns (uint256) {
        return _tradeExactAInput(exactAmountAIn, minAmountBOut, owner);
    }

    function tradeExactAOutput(
        uint256 exactAmountAOut,
        uint256 maxAmountBIn,
        address owner
    ) external returns (uint256) {
        return _tradeExactAOutput(exactAmountAOut, maxAmountBIn, owner);
    }

    function tradeExactBInput(
        uint256 exactAmountBIn,
        uint256 minAmountAOut,
        address owner
    ) external returns (uint256) {
        return _tradeExactBInput(exactAmountBIn, minAmountAOut, owner);
    }

    function tradeExactBOutput(
        uint256 exactAmountBOut,
        uint256 maxAmountAIn,
        address owner
    ) external returns (uint256) {
        return _tradeExactBOutput(exactAmountBOut, maxAmountAIn, owner);
    }

    function _getABPrice() internal override view returns (uint256) {
        return price;
    }

    function _getTradeDetailsExactAInput(uint256 exactAmountAIn) internal override returns (TradeDetails memory) {
        uint256 amountTokensOut = exactAmountAIn.mul(price).div(10**uint256(tokenADecimals()));
        uint256 feesTokenA = 0;
        uint256 feesTokenB = 0;
        TradeDetails memory tradeDetails = TradeDetails(
            amountTokensOut,
            feesTokenA,
            feesTokenB,
            abi.encode(exactAmountAIn)
        );

        return tradeDetails;
    }

    function _getTradeDetailsExactAOutput(uint256 exactAmountAOut) internal override returns (TradeDetails memory) {
        uint256 amountTokensBIn = exactAmountAOut.mul(price).div(10**uint256(tokenADecimals()));
        uint256 feesTokenA = 0;
        uint256 feesTokenB = 0;
        TradeDetails memory tradeDetails = TradeDetails(
            amountTokensBIn,
            feesTokenA,
            feesTokenB,
            abi.encode(amountTokensBIn)
        );

        return tradeDetails;
    }

    function _getTradeDetailsExactBInput(uint256 exactAmountBIn) internal override returns (TradeDetails memory) {
        uint256 amountTokensAOut = exactAmountBIn.mul(10**uint256(tokenBDecimals()).div(price));
        uint256 feesTokenA = 0;
        uint256 feesTokenB = 0;
        TradeDetails memory tradeDetails = TradeDetails(
            amountTokensAOut,
            feesTokenA,
            feesTokenB,
            abi.encode(amountTokensAOut)
        );

        return tradeDetails;
    }

    function _getTradeDetailsExactBOutput(uint256 exactAmountBOut) internal override returns (TradeDetails memory) {
        uint256 amountTokensAIn = exactAmountBOut.mul(10**uint256(tokenBDecimals()).div(price));
        uint256 feesTokenA = 0;
        uint256 feesTokenB = 0;
        TradeDetails memory tradeDetails = TradeDetails(
            amountTokensAIn,
            feesTokenA,
            feesTokenB,
            abi.encode(amountTokensAIn)
        );

        return tradeDetails;
    }

    function setPrice(uint256 _price) public {
        price = _price;
    }

    function _onTrade(TradeDetails memory) internal pure {
        return;
    }

    function _onTradeExactAInput(TradeDetails memory tradeDetails) internal override {
        _onTrade(tradeDetails);
    }

    function _onTradeExactAOutput(TradeDetails memory tradeDetails) internal override {
        _onTrade(tradeDetails);
    }

    function _onTradeExactBInput(TradeDetails memory tradeDetails) internal override {
        _onTrade(tradeDetails);
    }

    function _onTradeExactBOutput(TradeDetails memory tradeDetails) internal override {
        _onTrade(tradeDetails);
    }

    function _onRemoveLiquidity(UserDepositSnapshot memory userDepositSnapshot, address owner) internal override {
        return;
    }

    function _onAddLiquidity(UserDepositSnapshot memory userDepositSnapshot, address owner) internal override {
        return;
    }
}
