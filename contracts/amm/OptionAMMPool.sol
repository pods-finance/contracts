// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./AMM.sol";
import "../interfaces/IPriceProvider.sol";
import "../interfaces/IBlackScholes.sol";
import "../interfaces/ISigma.sol";
import "../interfaces/IPodOption.sol";
import "../interfaces/IOptionAMMPool.sol";
import "../interfaces/IFeePool.sol";

/**
 * Represents an Option specific single-sided AMM.
 *
 * The tokenA MUST be an PodOption contract implementation.
 * The tokenB is preferable to be an stable asset such as DAI or USDC.
 *
 * There are 4 external contracts used by this contract:
 *
 * - priceProvider: responsible for the the spot price of the option's underlying asset.
 * - priceMethod: responsible for the current price of the option itself.
 * - impliedVolatility: responsible for one of the priceMethod inputs:
 *     implied Volatility (also known as sigma)
 * - feePoolA and feePoolB: responsible for handling Liquidity providers fees.
 */

contract OptionAMMPool is AMM {
    using SafeMath for uint256;
    uint256 public constant BS_RES_DECIMALS = 18;
    uint256 private constant _SECONDS_IN_A_YEAR = 31536000;

    // External Contracts
    IPriceProvider public priceProvider;
    IBlackScholes public priceMethod;
    ISigma public impliedVolatility;
    IFeePool public feePoolA;
    IFeePool public feePoolB;

    // Option Info
    struct PriceProperties {
        uint256 expiration;
        uint256 strikePrice;
        address underlyingAsset;
        uint256 optionType;
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
        uint256 _initialSigma,
        address _feePoolA,
        address _feePoolB
    ) public AMM(_optionAddress, _stableAsset) {
        priceProperties.currentSigma = _initialSigma;
        priceProperties.sigmaInitialGuess = _initialSigma;
        priceProperties.underlyingAsset = IPodOption(_optionAddress).underlyingAsset();
        priceProperties.expiration = IPodOption(_optionAddress).expiration();
        priceProperties.optionType = IPodOption(_optionAddress).optionType();

        uint256 strikePrice = IPodOption(_optionAddress).strikePrice();
        uint256 strikePriceDecimals = IPodOption(_optionAddress).strikePriceDecimals();

        require(strikePriceDecimals <= BS_RES_DECIMALS, "not supported strikePrice unit");
        uint256 strikePriceWithRightDecimals = strikePrice.mul(10**(BS_RES_DECIMALS - strikePriceDecimals));

        priceProperties.strikePrice = strikePriceWithRightDecimals;

        priceProvider = IPriceProvider(_priceProvider);
        priceMethod = IBlackScholes(_priceMethod);
        impliedVolatility = ISigma(_sigma);
        feePoolA = IFeePool(_feePoolA);
        feePoolB = IFeePool(_feePoolB);

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

    function getABPrice() external view returns (uint256) {
        return _getABPrice();
    }

    function getOptionTradeDetailsExactAInput(uint256 exactAmountAIn)
        external
        view
        returns (
            uint256,
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
            uint256,
            uint256
        )
    {
        return _getOptionTradeDetailsExactBOutput(exactAmountBOut);
    }

    function getSpotPrice(address asset, uint256 decimalsOutput) external view returns (uint256) {
        return _getSpotPrice(asset, decimalsOutput);
    }

    /**
     * Internal function to check expiration
     */
    function _hasExpired() internal view returns (bool) {
        return block.timestamp >= priceProperties.expiration;
    }

    function _calculateNewABPrice(uint256 spotPrice, uint256 timeToMaturity) internal view returns (uint256) {
        uint256 newABPrice;

        if (priceProperties.optionType == 0) {
            newABPrice = priceMethod.getPutPrice(
                int256(spotPrice),
                int256(priceProperties.strikePrice),
                priceProperties.currentSigma,
                timeToMaturity,
                int256(priceProperties.riskFree)
            );
        } else {
            newABPrice = priceMethod.getCallPrice(
                int256(spotPrice),
                int256(priceProperties.strikePrice),
                priceProperties.currentSigma,
                timeToMaturity,
                int256(priceProperties.riskFree)
            );
        }
        uint256 newABPriceWithDecimals = newABPrice.div(10**(BS_RES_DECIMALS.sub(tokenBDecimals)));
        return newABPriceWithDecimals;
    }

    // returns maturity in years with 18 decimals
    function _getTimeToMaturityInYears() internal view returns (uint256) {
        return ((priceProperties.expiration - block.timestamp) * (10**BS_RES_DECIMALS)) / (_SECONDS_IN_A_YEAR);
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

    function _getSpotPrice(address asset, uint256 decimalsOutput) internal view returns (uint256) {
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
        uint256 newIV;
        if (priceProperties.optionType == 0) {
            (newIV, ) = impliedVolatility.getPutSigma(
                newTargetABPriceWithDecimals,
                properties.sigmaInitialGuess,
                spotPrice,
                properties.strikePrice,
                timeToMaturity,
                properties.riskFree
            );
        } else {
            (newIV, ) = impliedVolatility.getCallSigma(
                newTargetABPriceWithDecimals,
                properties.sigmaInitialGuess,
                spotPrice,
                properties.strikePrice,
                timeToMaturity,
                properties.riskFree
            );
        }
        return newIV;
    }

    function _getOptionTradeDetailsExactAInput(uint256 exactAmountAIn)
        internal
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        uint256 spotPrice = _getSpotPrice(priceProperties.underlyingAsset, BS_RES_DECIMALS);
        uint256 timeToMaturity = _getTimeToMaturityInYears();

        uint256 newABPrice = _calculateNewABPrice(spotPrice, timeToMaturity);

        uint256 amountBOutPool = _getAmountBOutPool(newABPrice, exactAmountAIn);

        uint256 feesTokenA = feePoolA.getCollectable(amountBOutPool);
        uint256 feesTokenB = feePoolB.getCollectable(amountBOutPool);

        uint256 amountBOutUser = amountBOutPool.sub(feesTokenA).sub(feesTokenB);

        uint256 newTargetABPrice = amountBOutPool.mul(10**uint256(tokenADecimals)).div(exactAmountAIn);

        uint256 newIV = _getNewIV(newTargetABPrice, spotPrice, timeToMaturity, priceProperties);

        return (amountBOutUser, newIV, feesTokenA, feesTokenB);
    }

    function _getAmountBOutPool(uint256 newABPrice, uint256 exactAmountAIn) internal view returns (uint256) {
        (uint256 poolAmountA, uint256 poolAmountB) = _getPoolAmounts(newABPrice);
        uint256 productConstant = poolAmountA.mul(poolAmountB);
        return poolAmountB.sub(productConstant.div(poolAmountA.add(exactAmountAIn)));
    }

    function _getOptionTradeDetailsExactAOutput(uint256 exactAmountAOut)
        internal
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        uint256 spotPrice = _getSpotPrice(priceProperties.underlyingAsset, BS_RES_DECIMALS);
        uint256 timeToMaturity = _getTimeToMaturityInYears();

        uint256 newABPrice = _calculateNewABPrice(spotPrice, timeToMaturity);

        uint256 amountBInPool = _getAmountBInPool(exactAmountAOut, newABPrice);

        uint256 feesTokenA = feePoolA.getCollectable(amountBInPool);
        uint256 feesTokenB = feePoolB.getCollectable(amountBInPool);

        uint256 amountBInUser = amountBInPool.add(feesTokenA).add(feesTokenB);

        uint256 newTargetABPrice = amountBInPool.mul(10**uint256(tokenADecimals)).div(exactAmountAOut);

        uint256 newIV = _getNewIV(newTargetABPrice, spotPrice, timeToMaturity, priceProperties);

        return (amountBInUser, newIV, feesTokenA, feesTokenB);
    }

    function _getAmountBInPool(uint256 exactAmountAOut, uint256 newABPrice) internal view returns (uint256) {
        (uint256 poolAmountA, uint256 poolAmountB) = _getPoolAmounts(newABPrice);
        uint256 productConstant = poolAmountA.mul(poolAmountB);
        return productConstant.div(poolAmountA.sub(exactAmountAOut)).sub(poolAmountB);
    }

    function _getOptionTradeDetailsExactBInput(uint256 exactAmountBIn)
        internal
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        uint256 spotPrice = _getSpotPrice(priceProperties.underlyingAsset, BS_RES_DECIMALS);
        uint256 timeToMaturity = _getTimeToMaturityInYears();

        uint256 newABPrice = _calculateNewABPrice(spotPrice, timeToMaturity);

        uint256 feesTokenA = feePoolA.getCollectable(exactAmountBIn);
        uint256 feesTokenB = feePoolB.getCollectable(exactAmountBIn);
        uint256 poolBIn = exactAmountBIn.sub(feesTokenA).sub(feesTokenB);

        uint256 amountAOut = _getAmountAOut(newABPrice, poolBIn);

        uint256 newTargetABPrice = poolBIn.mul(10**uint256(tokenADecimals)).div(amountAOut);

        uint256 newIV = _getNewIV(newTargetABPrice, spotPrice, timeToMaturity, priceProperties);

        return (amountAOut, newIV, feesTokenA, feesTokenB);
    }

    function _getAmountAOut(uint256 newABPrice, uint256 poolBIn) internal view returns (uint256) {
        (uint256 poolAmountA, uint256 poolAmountB) = _getPoolAmounts(newABPrice);
        uint256 productConstant = poolAmountA.mul(poolAmountB);
        return poolAmountA.sub(productConstant.div(poolAmountB.add(poolBIn)));
    }

    function _getOptionTradeDetailsExactBOutput(uint256 exactAmountBOut)
        internal
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        uint256 spotPrice = _getSpotPrice(priceProperties.underlyingAsset, BS_RES_DECIMALS);
        uint256 timeToMaturity = _getTimeToMaturityInYears();

        uint256 newABPrice = _calculateNewABPrice(spotPrice, timeToMaturity);

        uint256 feesTokenA = feePoolA.getCollectable(exactAmountBOut);
        uint256 feesTokenB = feePoolB.getCollectable(exactAmountBOut);

        uint256 amountAInPool = _getAmountAIn(exactAmountBOut, feesTokenA, feesTokenB, newABPrice);
        uint256 newTargetABPrice = exactAmountBOut.mul(10**uint256(tokenADecimals)).div(amountAInPool);

        uint256 newIV = _getNewIV(newTargetABPrice, spotPrice, timeToMaturity, priceProperties);

        return (amountAInPool, newIV, feesTokenA, feesTokenB);
    }

    function _getAmountAIn(
        uint256 exactAmountBOut,
        uint256 feesTokenA,
        uint256 feesTokenB,
        uint256 newABPrice
    ) internal view returns (uint256) {
        (uint256 poolAmountA, uint256 poolAmountB) = _getPoolAmounts(newABPrice);
        uint256 productConstant = poolAmountA.mul(poolAmountB);
        uint256 poolBOut = exactAmountBOut.add(feesTokenA).add(feesTokenB);
        return productConstant.div(poolAmountB.sub(poolBOut)).sub(poolAmountA);
    }

    function _getTradeDetailsExactAInput(uint256 exactAmountAIn) internal override returns (TradeDetails memory) {
        (uint256 amountBOut, uint256 newIV, uint256 feesTokenA, uint256 feesTokenB) = _getOptionTradeDetailsExactAInput(
            exactAmountAIn
        );

        TradeDetails memory tradeDetails = TradeDetails(amountBOut, feesTokenA, feesTokenB, abi.encodePacked(newIV));
        return tradeDetails;
    }

    function _getTradeDetailsExactAOutput(uint256 exactAmountAOut) internal override returns (TradeDetails memory) {
        (uint256 amountBIn, uint256 newIV, uint256 feesTokenA, uint256 feesTokenB) = _getOptionTradeDetailsExactAOutput(
            exactAmountAOut
        );

        TradeDetails memory tradeDetails = TradeDetails(amountBIn, feesTokenA, feesTokenB, abi.encodePacked(newIV));
        return tradeDetails;
    }

    function _getTradeDetailsExactBInput(uint256 exactAmountBIn) internal override returns (TradeDetails memory) {
        (uint256 amountAOut, uint256 newIV, uint256 feesTokenA, uint256 feesTokenB) = _getOptionTradeDetailsExactBInput(
            exactAmountBIn
        );

        TradeDetails memory tradeDetails = TradeDetails(amountAOut, feesTokenA, feesTokenB, abi.encodePacked(newIV));
        return tradeDetails;
    }

    function _getTradeDetailsExactBOutput(uint256 exactAmountBOut) internal override returns (TradeDetails memory) {
        (uint256 amountAIn, uint256 newIV, uint256 feesTokenA, uint256 feesTokenB) = _getOptionTradeDetailsExactBOutput(
            exactAmountBOut
        );

        TradeDetails memory tradeDetails = TradeDetails(amountAIn, feesTokenA, feesTokenB, abi.encodePacked(newIV));
        return tradeDetails;
    }

    function _onAddLiquidity(UserBalance memory _userBalance, address owner) internal override {
        uint256 currentQuotesA = feePoolA.sharesOf(owner);
        uint256 currentQuotesB = feePoolB.sharesOf(owner);
        uint256 amountOfQuotesAToAdd = _userBalance.tokenABalance.div(_userBalance.fImp).sub(currentQuotesA);
        uint256 amountOfQuotesBToAdd = _userBalance.tokenBBalance.div(_userBalance.fImp).sub(currentQuotesB);

        feePoolA.mint(owner, amountOfQuotesAToAdd);
        feePoolB.mint(owner, amountOfQuotesBToAdd);
    }

    function _onRemoveLiquidity(UserBalance memory _userBalance, address owner) internal override {
        uint256 currentQuotesA = feePoolA.sharesOf(owner);
        uint256 currentQuotesB = feePoolB.sharesOf(owner);
        uint256 amountOfQuotesAToRemove = currentQuotesA.sub(_userBalance.tokenABalance.div(_userBalance.fImp));
        uint256 amountOfQuotesBToRemove = currentQuotesB.sub(_userBalance.tokenBBalance.div(_userBalance.fImp));

        feePoolA.withdraw(owner, amountOfQuotesAToRemove);
        feePoolB.withdraw(owner, amountOfQuotesBToRemove);
    }

    function _onTrade(TradeDetails memory tradeDetails) internal {
        uint256 newSigma = abi.decode(tradeDetails.params, (uint256));
        priceProperties.currentSigma = newSigma;

        require(
            IERC20(tokenB).transfer(address(feePoolA), tradeDetails.feesTokenA),
            "Could not transfer Fees to feePoolA"
        );

        require(
            IERC20(tokenB).transfer(address(feePoolB), tradeDetails.feesTokenB),
            "Could not transfer Fees to feePoolB"
        );
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
