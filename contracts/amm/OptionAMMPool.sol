// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./AMM.sol";
import "../interfaces/IPriceProvider.sol";
import "../interfaces/IBlackScholes.sol";
import "../interfaces/ISigma.sol";
import "../interfaces/IPodOption.sol";
import "../interfaces/IOptionAMMPool.sol";

contract OptionAMMPool is AMM {
    using SafeMath for uint256;
    uint256 public constant BS_RES_DECIMALS = 18;
    uint256 constant SECONDS_IN_A_YEAR = 31536000;

    // External Contracts
    IPriceProvider public priceProvider;
    IBlackScholes public priceMethod;
    ISigma public impliedVolatility;

    // Option Info

    struct PriceProperties {
        uint256 expiration;
        uint256 strikePrice;
        address underlyingAsset;
        uint256 currentSigma;
        uint256 riskFree;
        uint256 sigmaInitialGuess;
    }

    PriceProperties public priceProperties;

    constructor(
        address _optionAddress,
        address _stableAsset,
        address _priceProvider,
        address _priceMethod,
        address _sigma,
        uint256 _initialSigma
    ) public AMM(_optionAddress, _stableAsset) {
        priceProperties.currentSigma = _initialSigma;
        priceProperties.underlyingAsset = IPodOption(_optionAddress).underlyingAsset();
        priceProperties.expiration = IPodOption(_optionAddress).expiration();

        uint256 strikePrice = IPodOption(_optionAddress).strikePrice();
        uint256 strikePriceDecimals = IPodOption(_optionAddress).strikePriceDecimals();

        require(strikePriceDecimals <= BS_RES_DECIMALS, "not suportable strikePrice unit");
        uint256 strikePriceWithRightDecimals = strikePrice.mul(10**(BS_RES_DECIMALS - strikePriceDecimals));

        priceProperties.strikePrice = strikePriceWithRightDecimals;

        priceProvider = IPriceProvider(_priceProvider);
        priceMethod = IBlackScholes(_priceMethod);
        impliedVolatility = ISigma(_sigma);

        address sigmaBSAddress = impliedVolatility.blackScholes();
        // Check if sigma black scholes version is the same as the above
        require(sigmaBSAddress == _priceMethod, "not same BS contract version");
    }

    /**
     * Maker modifier for functions which are only allowed to be executed
     * BEFORE series expiration.
     */
    modifier beforeExpiration() {
        if (_hasExpired()) {
            revert("Option has expired");
        }
        _;
    }

    /**
     * Internal function to check expiration
     */
    function _hasExpired() internal view returns (bool) {
        return block.timestamp >= priceProperties.expiration;
    }

    function addLiquidity(
        uint256 amountOfA,
        uint256 amountOfB,
        address owner
    ) external beforeExpiration {
        return _addLiquidity(amountOfA, amountOfB, owner);
    }

    function removeLiquidity(uint256 amountOfA, uint256 amountOfB) external {
        return _removeLiquidity(amountOfA, amountOfB);
    }

    function tradeExactAInput(
        uint256 exactAmountAIn,
        uint256 minAmountBOut,
        address owner,
        uint256 sigmaInitialGuess
    ) external beforeExpiration returns (uint256) {
        priceProperties.sigmaInitialGuess = sigmaInitialGuess;
        return _tradeExactAInput(exactAmountAIn, minAmountBOut, owner);
    }

    function tradeExactAOutput(
        uint256 exactAmountAOut,
        uint256 maxAmountBIn,
        address owner,
        uint256 sigmaInitialGuess
    ) external beforeExpiration returns (uint256) {
        priceProperties.sigmaInitialGuess = sigmaInitialGuess;
        return _tradeExactAOutput(exactAmountAOut, maxAmountBIn, owner);
    }

    function tradeExactBInput(
        uint256 exactAmountBIn,
        uint256 minAmountAOut,
        address owner,
        uint256 sigmaInitialGuess
    ) external beforeExpiration returns (uint256) {
        priceProperties.sigmaInitialGuess = sigmaInitialGuess;
        return _tradeExactBInput(exactAmountBIn, minAmountAOut, owner);
    }

    function tradeExactBOutput(
        uint256 exactAmountBOut,
        uint256 maxAmountAIn,
        address owner,
        uint256 sigmaInitialGuess
    ) external beforeExpiration returns (uint256) {
        priceProperties.sigmaInitialGuess = sigmaInitialGuess;
        return _tradeExactBOutput(exactAmountBOut, maxAmountAIn, owner);
    }

    function _calculateNewABPrice(uint256 spotPrice, uint256 timeToMaturity) internal view returns (uint256) {
        uint256 newABPrice = priceMethod.getPutPrice(
            int256(spotPrice),
            int256(priceProperties.strikePrice),
            priceProperties.currentSigma,
            timeToMaturity,
            int256(priceProperties.riskFree)
        );
        uint256 newABPriceWithDecimals = newABPrice.div(10**(BS_RES_DECIMALS.sub(tokenBDecimals)));
        return newABPriceWithDecimals;
    }

    // returns maturity in years with 18 decimals
    function _getTimeToMaturityInYears() internal view returns (uint256) {
        return ((priceProperties.expiration - block.timestamp) * (10**BS_RES_DECIMALS)) / (SECONDS_IN_A_YEAR);
    }

    function _getPoolAmounts(uint256 newABPrice) internal view returns (uint256, uint256) {
        (uint256 totalAmountA, uint256 totalAmountB) = _getPoolBalances();
        uint256 poolAmountA = min(totalAmountA, totalAmountB.mul(10**uint256(tokenADecimals)).div(newABPrice));
        uint256 poolAmountB = min(totalAmountB, totalAmountA.mul(newABPrice).div(10**uint256(tokenADecimals)));
        return (poolAmountA, poolAmountB);
    }

    function _getABPrice() internal override view returns (uint256) {
        uint256 spotPrice = _getSpotPrice(priceProperties.underlyingAsset, BS_RES_DECIMALS);
        uint256 timeToMaturity = _getTimeToMaturityInYears();

        uint256 newABPrice = _calculateNewABPrice(spotPrice, timeToMaturity);
        uint256 newABPriceWithDecimals = newABPrice.div(10**(BS_RES_DECIMALS.sub(tokenBDecimals)));
        return newABPriceWithDecimals;
    }

    function getABPrice() public view returns (uint256) {
        return _getABPrice();
    }

    function _getSpotPrice(address asset, uint256 decimalsOutput) public view returns (uint256) {
        uint256 spotPrice = priceProvider.getAssetPrice(asset);
        uint256 spotPriceDecimals = priceProvider.getAssetDecimals(asset);
        uint256 diffDecimals;
        uint256 spotPriceWithRightPrecision;

        if (decimalsOutput <= spotPriceDecimals) {
            diffDecimals = spotPriceDecimals.sub(decimalsOutput);
            spotPriceWithRightPrecision = spotPrice.div(10**diffDecimals);
        } else {
            diffDecimals = decimalsOutput.sub(spotPriceDecimals);
            spotPriceWithRightPrecision = spotPrice.mul(10**diffDecimals);
        }
        return spotPriceWithRightPrecision;
    }

    function _getNewIV(
        uint256 newTargetABPrice,
        uint256 spotPrice,
        uint256 timeToMaturity,
        PriceProperties memory properties
    ) internal view returns (uint256) {
        uint256 newTargetABPriceWithDecimals = newTargetABPrice.mul(10**(BS_RES_DECIMALS.sub(tokenBDecimals)));
        (uint256 newIV, ) = impliedVolatility.getPutSigma(
            newTargetABPriceWithDecimals,
            properties.sigmaInitialGuess,
            spotPrice,
            properties.strikePrice,
            timeToMaturity,
            properties.riskFree
        );
        return newIV;
    }

    function getOptionTradeDetailsExactAInput(uint256 exactAmountAIn)
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        return _getOptionTradeDetailsExactAInput(exactAmountAIn);
    }

    function getOptionTradeDetailsExactAOutput(uint256 exactAmountAOut)
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        return _getOptionTradeDetailsExactAOutput(exactAmountAOut);
    }

    function getOptionTradeDetailsExactBInput(uint256 exactAmountBIn)
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        return _getOptionTradeDetailsExactBInput(exactAmountBIn);
    }

    function getOptionTradeDetailsExactBOutput(uint256 exactAmountBOut)
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        return _getOptionTradeDetailsExactBOutput(exactAmountBOut);
    }

    function _getOptionTradeDetailsExactAInput(uint256 exactAmountAIn)
        internal
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        uint256 spotPrice = _getSpotPrice(priceProperties.underlyingAsset, BS_RES_DECIMALS);
        uint256 timeToMaturity = _getTimeToMaturityInYears();

        uint256 newABPrice = _calculateNewABPrice(spotPrice, timeToMaturity);

        (uint256 poolAmountA, uint256 poolAmountB) = _getPoolAmounts(newABPrice);
        uint256 productConstant = poolAmountA.mul(poolAmountB);

        uint256 amountBOutPool = poolAmountB.sub(productConstant.div(poolAmountA.add(exactAmountAIn)));
        uint256 fees = amountBOutPool.mul(997).div(1000);
        uint256 amountBOutUser = amountBOutPool.sub(fees);

        uint256 newTargetABPrice = amountBOutPool.mul(10**uint256(tokenADecimals)).div(exactAmountAIn);

        uint256 newIV = _getNewIV(newTargetABPrice, spotPrice, timeToMaturity, priceProperties);

        return (amountBOutUser, newIV, fees);
    }

    function _getOptionTradeDetailsExactAOutput(uint256 exactAmountAOut)
        internal
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        uint256 spotPrice = _getSpotPrice(priceProperties.underlyingAsset, BS_RES_DECIMALS);
        uint256 timeToMaturity = _getTimeToMaturityInYears();

        uint256 newABPrice = _calculateNewABPrice(spotPrice, timeToMaturity);

        (uint256 poolAmountA, uint256 poolAmountB) = _getPoolAmounts(newABPrice);
        uint256 productConstant = poolAmountA.mul(poolAmountB);

        uint256 amountBInPool = productConstant.div(poolAmountA.sub(exactAmountAOut)).sub(poolAmountB);
        uint256 fees = amountBInPool.mul(997).div(1000);
        uint256 amountBInUser = amountBInPool.add(fees);

        uint256 newTargetABPrice = amountBInPool.mul(10**uint256(tokenADecimals)).div(exactAmountAOut);

        uint256 newIV = _getNewIV(newTargetABPrice, spotPrice, timeToMaturity, priceProperties);

        return (amountBInUser, newIV, fees);
    }

    function _getOptionTradeDetailsExactBInput(uint256 exactAmountBIn)
        internal
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        uint256 spotPrice = _getSpotPrice(priceProperties.underlyingAsset, BS_RES_DECIMALS);
        uint256 timeToMaturity = _getTimeToMaturityInYears();

        uint256 newABPrice = _calculateNewABPrice(spotPrice, timeToMaturity);

        (uint256 poolAmountA, uint256 poolAmountB) = _getPoolAmounts(newABPrice);
        uint256 productConstant = poolAmountA.mul(poolAmountB);

        uint256 fees = exactAmountBIn.mul(997).div(1000);
        uint256 poolBIn = exactAmountBIn.sub(fees);

        uint256 amountAOut = poolAmountA.sub(productConstant.div(poolAmountB.add(poolBIn)));

        uint256 newTargetABPrice = poolBIn.mul(10**uint256(tokenADecimals)).div(amountAOut);

        uint256 newIV = _getNewIV(newTargetABPrice, spotPrice, timeToMaturity, priceProperties);

        return (amountAOut, newIV, fees);
    }

    function _getOptionTradeDetailsExactBOutput(uint256 exactAmountBOut)
        internal
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        uint256 spotPrice = _getSpotPrice(priceProperties.underlyingAsset, BS_RES_DECIMALS);
        uint256 timeToMaturity = _getTimeToMaturityInYears();

        uint256 newABPrice = _calculateNewABPrice(spotPrice, timeToMaturity);

        uint256 fees = exactAmountBOut.mul(997).div(1000);

        uint256 amountAInPool = _getAmountAIn(exactAmountBOut, fees, newABPrice);
        uint256 newTargetABPrice = exactAmountBOut.mul(10**uint256(tokenADecimals)).div(amountAInPool);

        uint256 newIV = _getNewIV(newTargetABPrice, spotPrice, timeToMaturity, priceProperties);

        return (amountAInPool, newIV, fees);
    }

    function _getAmountAIn(
        uint256 exactAmountBOut,
        uint256 fees,
        uint256 newABPrice
    ) internal view returns (uint256) {
        (uint256 poolAmountA, uint256 poolAmountB) = _getPoolAmounts(newABPrice);
        uint256 productConstant = poolAmountA.mul(poolAmountB);
        uint256 poolBOut = exactAmountBOut.add(fees);
        return productConstant.div(poolAmountB.sub(poolBOut)).sub(poolAmountA);
    }

    function _getTradeDetailsExactAInput(uint256 exactAmountAIn) internal override returns (TradeDetails memory) {
        (uint256 amountBOut, uint256 newIV, uint256 fees) = _getOptionTradeDetailsExactAInput(exactAmountAIn);

        TradeDetails memory tradeDetails = TradeDetails(amountBOut, fees, abi.encodePacked(newIV));
        return tradeDetails;
    }

    function _getTradeDetailsExactAOutput(uint256 exactAmountAOut) internal override returns (TradeDetails memory) {
        (uint256 amountBIn, uint256 newIV, uint256 fees) = _getOptionTradeDetailsExactAOutput(exactAmountAOut);

        TradeDetails memory tradeDetails = TradeDetails(amountBIn, fees, abi.encodePacked(newIV));
        return tradeDetails;
    }

    function _getTradeDetailsExactBInput(uint256 exactAmountBIn) internal override returns (TradeDetails memory) {
        (uint256 amountAOut, uint256 newIV, uint256 fees) = _getOptionTradeDetailsExactAInput(exactAmountBIn);

        TradeDetails memory tradeDetails = TradeDetails(amountAOut, fees, abi.encodePacked(newIV));
        return tradeDetails;
    }

    function _getTradeDetailsExactBOutput(uint256 exactAmountBOut) internal override returns (TradeDetails memory) {
        (uint256 amountAIn, uint256 newIV, uint256 fees) = _getOptionTradeDetailsExactAOutput(exactAmountBOut);

        TradeDetails memory tradeDetails = TradeDetails(amountAIn, fees, abi.encodePacked(newIV));
        return tradeDetails;
    }

    function _onTrade(TradeDetails memory tradeDetails) internal {
        uint256 newSigma = abi.decode(tradeDetails.params, (uint256));
        priceProperties.currentSigma = newSigma;

        //Cobra fee
        // contractFeePoolA.pushFees(tradeDetails.fees.div(2));
        // contractFeePoolB.pushFees(tradeDetails.fees.div(2));
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
}
