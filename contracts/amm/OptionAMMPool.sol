// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./AMM.sol";
import "../lib/CappedPool.sol";
import "../interfaces/IPriceProvider.sol";
import "../interfaces/IBlackScholes.sol";
import "../interfaces/ISigma.sol";
import "../interfaces/IPodOption.sol";
import "../interfaces/IOptionAMMPool.sol";
import "../interfaces/IFeePool.sol";
import "../interfaces/IConfigurationManager.sol";
import "../interfaces/IEmergencyStop.sol";

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

contract OptionAMMPool is AMM, IOptionAMMPool, CappedPool {
    using SafeMath for uint256;
    uint256 public constant PRICING_DECIMALS = 18;
    uint256 private constant _SECONDS_IN_A_YEAR = 31536000;

    // External Contracts
    /**
     * @notice store globally accessed configurations
     */
    IConfigurationManager public configurationManager;

    /**
     * @notice responsible for handling Liquidity providers fees of the token A
     */
    IFeePool public feePoolA;

    /**
     * @notice responsible for handling Liquidity providers fees of the token B
     */
    IFeePool public feePoolB;

    // Option Info
    struct PriceProperties {
        uint256 expiration;
        uint256 startOfExerciseWindow;
        uint256 strikePrice;
        address underlyingAsset;
        IPodOption.OptionType optionType;
        uint256 currentSigma;
        int256 riskFree;
        uint256 sigmaInitialGuess;
    }

    /**
     * @notice priceProperties are all information needed to handle the price discovery method
     * most of the properties will be used by getABPrice
     */
    PriceProperties public priceProperties;

    constructor(
        address _optionAddress,
        address _stableAsset,
        uint256 _initialSigma,
        address _feePoolA,
        address _feePoolB,
        IConfigurationManager _configurationManager
    ) public AMM(_optionAddress, _stableAsset) CappedPool(_configurationManager) {
        require(Address.isContract(_feePoolA) && Address.isContract(_feePoolB), "Pool: Invalid fee pools");
        require(
            IPodOption(_optionAddress).exerciseType() == IPodOption.ExerciseType.EUROPEAN,
            "Pool: invalid exercise type"
        );

        priceProperties.currentSigma = _initialSigma;
        priceProperties.sigmaInitialGuess = _initialSigma;
        priceProperties.underlyingAsset = IPodOption(_optionAddress).underlyingAsset();
        priceProperties.expiration = IPodOption(_optionAddress).expiration();
        priceProperties.startOfExerciseWindow = IPodOption(_optionAddress).startOfExerciseWindow();
        priceProperties.optionType = IPodOption(_optionAddress).optionType();

        uint256 strikePrice = IPodOption(_optionAddress).strikePrice();
        uint256 strikePriceDecimals = IPodOption(_optionAddress).strikePriceDecimals();

        require(strikePriceDecimals <= PRICING_DECIMALS, "Pool: invalid strikePrice unit");
        require(tokenBDecimals() <= PRICING_DECIMALS, "Pool: invalid tokenB unit");
        uint256 strikePriceWithRightDecimals = strikePrice.mul(10**(PRICING_DECIMALS - strikePriceDecimals));

        priceProperties.strikePrice = strikePriceWithRightDecimals;

        feePoolA = IFeePool(_feePoolA);
        feePoolB = IFeePool(_feePoolB);
        configurationManager = IConfigurationManager(_configurationManager);
    }

    /**
     * @notice addLiquidity in any proportion of tokenA or tokenB
     *
     * @dev This function can only be called before option expiration
     *
     * @param amountOfA amount of TokenA to add
     * @param amountOfB amount of TokenB to add
     * @param owner address of the account that will have ownership of the liquidity
     */
    function addLiquidity(
        uint256 amountOfA,
        uint256 amountOfB,
        address owner
    ) external override capped(tokenB(), amountOfB) {
        _beforeStartOfExerciseWindow();
        _emergencyStopCheck();
        _addLiquidity(amountOfA, amountOfB, owner);
    }

    /**
     * @notice removeLiquidity in any proportion of tokenA or tokenB
     *
     * @param amountOfA amount of TokenA to add
     * @param amountOfB amount of TokenB to add
     */
    function removeLiquidity(uint256 amountOfA, uint256 amountOfB) external override {
        _emergencyStopCheck();
        _removeLiquidity(amountOfA, amountOfB);
    }

    /**
     * @notice tradeExactAInput msg.sender is able to trade exact amount of token A in exchange for minimum
     * amount of token B and send the tokens B to the owner. After that, this function also updates the
     * priceProperties.* currentSigma
     *
     * @dev sigmaInitialGuess is a parameter for gas saving costs purpose. Instead of calculating the new sigma
     * out of thin ar, caller can help the Numeric Method achieve the result in less iterations with this parameter.
     * In order to know which guess the caller should use, call the getOptionTradeDetailsExactAInput first.
     *
     * @param exactAmountAIn exact amount of A token that will be transfer from msg.sender
     * @param minAmountBOut minimum acceptable amount of token B to transfer to owner
     * @param owner the destination address that will receive the token B
     * @param sigmaInitialGuess The first guess that the Numeric Method (getPutSigma / getCallSigma) should use
     */
    function tradeExactAInput(
        uint256 exactAmountAIn,
        uint256 minAmountBOut,
        address owner,
        uint256 sigmaInitialGuess
    ) external override returns (uint256) {
        _beforeStartOfExerciseWindow();
        _emergencyStopCheck();
        priceProperties.sigmaInitialGuess = sigmaInitialGuess;
        return _tradeExactAInput(exactAmountAIn, minAmountBOut, owner);
    }

    /**
     * @notice _tradeExactAOutput owner is able to receive exact amount of token A in exchange of a max
     * acceptable amount of token B transfer from the msg.sender. After that, this function also updates
     * the priceProperties.currentSigma
     *
     * @dev sigmaInitialGuess is a parameter for gas saving costs purpose. Instead of calculating the new sigma
     * out of thin ar, caller can help the Numeric Method achieve the result in less iterations with this parameter.
     * In order to know which guess the caller should use, call the getOptionTradeDetailsExactAOutput first.
     *
     * @param exactAmountAOut exact amount of token A that will be transfer to owner
     * @param maxAmountBIn maximum acceptable amount of token B to transfer from msg.sender
     * @param owner the destination address that will receive the token A
     * @param sigmaInitialGuess The first guess that the Numeric Method (getPutSigma / getCallSigma) should use
     */
    function tradeExactAOutput(
        uint256 exactAmountAOut,
        uint256 maxAmountBIn,
        address owner,
        uint256 sigmaInitialGuess
    ) external override returns (uint256) {
        _beforeStartOfExerciseWindow();
        _emergencyStopCheck();
        priceProperties.sigmaInitialGuess = sigmaInitialGuess;
        return _tradeExactAOutput(exactAmountAOut, maxAmountBIn, owner);
    }

    /**
     * @notice _tradeExactBInput msg.sender is able to trade exact amount of token B in exchange for minimum
     * amount of token A sent to the owner. After that, this function also updates the priceProperties.currentSigma
     *
     * @dev sigmaInitialGuess is a parameter for gas saving costs purpose. Instead of calculating the new sigma
     * out of thin ar, caller can help the Numeric Method achieve the result ini less iterations with this parameter.
     * In order to know which guess the caller should use, call the getOptionTradeDetailsExactBInput first.
     *
     * @param exactAmountBIn exact amount of token B that will be transfer from msg.sender
     * @param minAmountAOut minimum acceptable amount of token A to transfer to owner
     * @param owner the destination address that will receive the token A
     * @param sigmaInitialGuess The first guess that the Numeric Method (getPutSigma / getCallSigma) should use
     */
    function tradeExactBInput(
        uint256 exactAmountBIn,
        uint256 minAmountAOut,
        address owner,
        uint256 sigmaInitialGuess
    ) external override returns (uint256) {
        _beforeStartOfExerciseWindow();
        _emergencyStopCheck();
        priceProperties.sigmaInitialGuess = sigmaInitialGuess;
        return _tradeExactBInput(exactAmountBIn, minAmountAOut, owner);
    }

    /**
     * @notice _tradeExactBOutput owner is able to receive exact amount of token B in exchange of a max
     * acceptable amount of token A transfer from msg.sender. After that, this function also updates the
     * priceProperties.currentSigma
     *
     * @dev sigmaInitialGuess is a parameter for gas saving costs purpose. Instead of calculating the new sigma
     * out of thin ar, caller can help the Numeric Method achieve the result ini less iterations with this parameter.
     * In order to know which guess the caller should use, call the getOptionTradeDetailsExactBOutput first.
     *
     * @param exactAmountBOut exact amount of token B that will be transfer to owner
     * @param maxAmountAIn maximum acceptable amount of token A to transfer from msg.sender
     * @param owner the destination address that will receive the token B
     * @param sigmaInitialGuess The first guess that the Numeric Method (getPutSigma / getCallSigma) should use
     */
    function tradeExactBOutput(
        uint256 exactAmountBOut,
        uint256 maxAmountAIn,
        address owner,
        uint256 sigmaInitialGuess
    ) external override returns (uint256) {
        _beforeStartOfExerciseWindow();
        _emergencyStopCheck();
        priceProperties.sigmaInitialGuess = sigmaInitialGuess;
        return _tradeExactBOutput(exactAmountBOut, maxAmountAIn, owner);
    }

    /**
     * @notice getABPrice This function wll call internal function _getABPrice that will calculate the
     * calculate the ABPrice based on current market conditions. It calculates only the unit price AB, not taking in
     * consideration the slippage.
     *
     * @return ABPrice ABPrice is the unit price AB. Meaning how many units of B, buys 1 unit of A
     */
    function getABPrice() external override view returns (uint256 ABPrice) {
        return _getABPrice();
    }

    /**
     * @notice getOptionTradeDetailsExactAInput view function that simulates a trade, in order the preview
     * the amountBOut, the new sigma (IV), that will be used as the sigmaInitialGuess if caller wants to perform
     * a trade in sequence. Also returns the amount of Fees that will be payed to liquidity pools A and B.
     *
     * @param exactAmountAIn amount of token A that will by transfer from msg.sender to the pool
     *
     * @return amountBOut amount of B in exchange of the exactAmountAIn
     * @return newIV the new sigma that this trade will result
     * @return feesTokenA amount of fees of collected by token A
     * @return feesTokenB amount of fees of collected by token B
     */
    function getOptionTradeDetailsExactAInput(uint256 exactAmountAIn)
        external
        override
        view
        returns (
            uint256 amountBOut,
            uint256 newIV,
            uint256 feesTokenA,
            uint256 feesTokenB
        )
    {
        return _getOptionTradeDetailsExactAInput(exactAmountAIn);
    }

    /**
     * @notice getOptionTradeDetailsExactAOutput view function that simulates a trade, in order the preview
     * the amountBIn, the new sigma (IV), that will be used as the sigmaInitialGuess if caller wants to perform
     * a trade in sequence. Also returns the amount of Fees that will be payed to liquidity pools A and B.
     *
     * @param exactAmountAOut amount of token A that will by transfer from pool to the msg.sender/owner
     *
     * @return amountBIn amount of B that will be transfer from msg.sender to the pool
     * @return newIV the new sigma that this trade will result
     * @return feesTokenA amount of fees of collected by token A
     * @return feesTokenB amount of fees of collected by token B
     */
    function getOptionTradeDetailsExactAOutput(uint256 exactAmountAOut)
        external
        override
        view
        returns (
            uint256 amountBIn,
            uint256 newIV,
            uint256 feesTokenA,
            uint256 feesTokenB
        )
    {
        return _getOptionTradeDetailsExactAOutput(exactAmountAOut);
    }

    /**
     * @notice getOptionTradeDetailsExactBInput view function that simulates a trade, in order the preview
     * the amountAOut, the new sigma (IV), that will be used as the sigmaInitialGuess if caller wants to perform
     * a trade in sequence. Also returns the amount of Fees that will be payed to liquidity pools A and B.
     *
     * @param exactAmountBIn amount of token B that will by transfer from msg.sender to the pool
     *
     * @return amountAOut amount of A that will be transfer from contract to owner
     * @return newIV the new sigma that this trade will result
     * @return feesTokenA amount of fees of collected by token A
     * @return feesTokenB amount of fees of collected by token B
     */
    function getOptionTradeDetailsExactBInput(uint256 exactAmountBIn)
        external
        override
        view
        returns (
            uint256 amountAOut,
            uint256 newIV,
            uint256 feesTokenA,
            uint256 feesTokenB
        )
    {
        return _getOptionTradeDetailsExactBInput(exactAmountBIn);
    }

    /**
     * @notice getOptionTradeDetailsExactBOutput view function that simulates a trade, in order the preview
     * the amountAIn, the new sigma (IV), that will be used as the sigmaInitialGuess if caller wants to perform
     * a trade in sequence. Also returns the amount of Fees that will be payed to liquidity pools A and B.
     *
     * @param exactAmountBOut amount of token B that will by transfer from pool to the msg.sender/owner
     *
     * @return amountAIn amount of A that will be transfer from msg.sender to the pool
     * @return newIV the new sigma that this trade will result
     * @return feesTokenA amount of fees of collected by token A
     * @return feesTokenB amount of fees of collected by token B
     */
    function getOptionTradeDetailsExactBOutput(uint256 exactAmountBOut)
        external
        override
        view
        returns (
            uint256 amountAIn,
            uint256 newIV,
            uint256 feesTokenA,
            uint256 feesTokenB
        )
    {
        return _getOptionTradeDetailsExactBOutput(exactAmountBOut);
    }

    /**
     * @notice getSpotPrice Check the spot price of given asset with a certain precision controlled by decimalsOutput
     *
     * @param asset address to check the spot price
     * @param decimalsOutput number of decimals of the response
     *
     * @return spotPrice amount of A that will be transfer from msg.sender to the pool
     */

    function getSpotPrice(address asset, uint256 decimalsOutput) external override view returns (uint256 spotPrice) {
        return _getSpotPrice(asset, decimalsOutput);
    }

    function _calculateNewABPrice(uint256 spotPrice, uint256 timeToMaturity) internal view returns (uint256) {
        if (timeToMaturity == 0) {
            return 0;
        }
        IBlackScholes pricingMethod = IBlackScholes(configurationManager.getPricingMethod());
        uint256 newABPrice;

        if (priceProperties.optionType == IPodOption.OptionType.PUT) {
            newABPrice = pricingMethod.getPutPrice(
                spotPrice,
                priceProperties.strikePrice,
                priceProperties.currentSigma,
                timeToMaturity,
                priceProperties.riskFree
            );
        } else {
            newABPrice = pricingMethod.getCallPrice(
                spotPrice,
                priceProperties.strikePrice,
                priceProperties.currentSigma,
                timeToMaturity,
                priceProperties.riskFree
            );
        }
        if (newABPrice == 0) {
            return 0;
        }
        uint256 newABPriceWithDecimals = newABPrice.div(10**(PRICING_DECIMALS.sub(tokenBDecimals())));
        return newABPriceWithDecimals;
    }

    /**
     * @dev Check for functions which are only allowed to be executed
     * BEFORE start of exercise window.
     */
    function _beforeStartOfExerciseWindow() internal view {
        require(block.timestamp < priceProperties.startOfExerciseWindow, "Pool: exercise window has started");
    }

    /**
     * @dev returns maturity in years with 18 decimals
     */
    function _getTimeToMaturityInYears() internal view returns (uint256) {
        if (block.timestamp >= priceProperties.expiration) {
            return 0;
        }
        return priceProperties.expiration.sub(block.timestamp).mul(10**PRICING_DECIMALS).div(_SECONDS_IN_A_YEAR);
    }

    function _getPoolAmounts(uint256 newABPrice) internal view returns (uint256 poolAmountA, uint256 poolAmountB) {
        (uint256 totalAmountA, uint256 totalAmountB) = _getPoolBalances();
        if (newABPrice != 0) {
            poolAmountA = _min(totalAmountA, totalAmountB.mul(10**uint256(tokenADecimals())).div(newABPrice));
            poolAmountB = _min(totalAmountB, totalAmountA.mul(newABPrice).div(10**uint256(tokenADecimals())));
        }
        return (poolAmountA, poolAmountB);
    }

    function _getABPrice() internal override view returns (uint256) {
        uint256 spotPrice = _getSpotPrice(priceProperties.underlyingAsset, PRICING_DECIMALS);
        uint256 timeToMaturity = _getTimeToMaturityInYears();

        uint256 newABPrice = _calculateNewABPrice(spotPrice, timeToMaturity);
        return newABPrice;
    }

    function _getSpotPrice(address asset, uint256 decimalsOutput) internal view returns (uint256) {
        IPriceProvider priceProvider = IPriceProvider(configurationManager.getPriceProvider());
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
        uint256 newTargetABPriceWithDecimals = newTargetABPrice.mul(10**(PRICING_DECIMALS.sub(tokenBDecimals())));
        uint256 newIV;
        ISigma impliedVolatility = ISigma(configurationManager.getImpliedVolatility());
        if (priceProperties.optionType == IPodOption.OptionType.PUT) {
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
        uint256 spotPrice = _getSpotPrice(priceProperties.underlyingAsset, PRICING_DECIMALS);
        uint256 timeToMaturity = _getTimeToMaturityInYears();
        uint256 newABPrice = _calculateNewABPrice(spotPrice, timeToMaturity);
        if (newABPrice == 0) {
            return (0, 0, 0, 0);
        }

        (uint256 amountBOutPool, uint256 newTargetABPrice) = _getAmountBOutPool(newABPrice, exactAmountAIn);

        if (!_isValidTargetPrice(newTargetABPrice, spotPrice)) {
            return (0, 0, 0, 0);
        }

        uint256 feesTokenA = feePoolA.getCollectable(amountBOutPool);
        uint256 feesTokenB = feePoolB.getCollectable(amountBOutPool);

        uint256 amountBOutUser = amountBOutPool.sub(feesTokenA).sub(feesTokenB);

        uint256 newIV = _getNewIV(newTargetABPrice, spotPrice, timeToMaturity, priceProperties);

        return (amountBOutUser, newIV, feesTokenA, feesTokenB);
    }

    function _getAmountBOutPool(uint256 newABPrice, uint256 exactAmountAIn)
        internal
        view
        returns (uint256 amountBOut, uint256 newPrice)
    {
        (uint256 poolAmountA, uint256 poolAmountB) = _getPoolAmounts(newABPrice);
        uint256 productConstant = poolAmountA.mul(poolAmountB);
        amountBOut = poolAmountB.sub(productConstant.div(poolAmountA.add(exactAmountAIn)));
        newPrice = poolAmountB.sub(amountBOut).mul(10**uint256(tokenADecimals())).div(poolAmountA.add(exactAmountAIn));
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
        uint256 spotPrice = _getSpotPrice(priceProperties.underlyingAsset, PRICING_DECIMALS);
        uint256 timeToMaturity = _getTimeToMaturityInYears();

        uint256 newABPrice = _calculateNewABPrice(spotPrice, timeToMaturity);
        if (newABPrice == 0) {
            return (0, 0, 0, 0);
        }

        (uint256 amountBInPool, uint256 newTargetABPrice) = _getAmountBInPool(exactAmountAOut, newABPrice);
        uint256 feesTokenA = feePoolA.getCollectable(amountBInPool);
        uint256 feesTokenB = feePoolB.getCollectable(amountBInPool);

        uint256 amountBInUser = amountBInPool.add(feesTokenA).add(feesTokenB);

        uint256 newIV = _getNewIV(newTargetABPrice, spotPrice, timeToMaturity, priceProperties);

        return (amountBInUser, newIV, feesTokenA, feesTokenB);
    }

    function _getAmountBInPool(uint256 exactAmountAOut, uint256 newABPrice)
        internal
        view
        returns (uint256 amountBIn, uint256 newPrice)
    {
        (uint256 poolAmountA, uint256 poolAmountB) = _getPoolAmounts(newABPrice);
        uint256 productConstant = poolAmountA.mul(poolAmountB);
        amountBIn = productConstant.div(poolAmountA.sub(exactAmountAOut)).sub(poolAmountB);
        newPrice = poolAmountB.add(amountBIn).mul(10**uint256(tokenADecimals())).div(poolAmountA.sub(exactAmountAOut));
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
        uint256 spotPrice = _getSpotPrice(priceProperties.underlyingAsset, PRICING_DECIMALS);
        uint256 timeToMaturity = _getTimeToMaturityInYears();

        uint256 newABPrice = _calculateNewABPrice(spotPrice, timeToMaturity);
        if (newABPrice == 0) {
            return (0, 0, 0, 0);
        }

        uint256 feesTokenA = feePoolA.getCollectable(exactAmountBIn);
        uint256 feesTokenB = feePoolB.getCollectable(exactAmountBIn);
        uint256 poolBIn = exactAmountBIn.sub(feesTokenA).sub(feesTokenB);

        (uint256 amountAOut, uint256 newTargetABPrice) = _getAmountAOut(newABPrice, poolBIn);

        uint256 newIV = _getNewIV(newTargetABPrice, spotPrice, timeToMaturity, priceProperties);

        return (amountAOut, newIV, feesTokenA, feesTokenB);
    }

    function _getAmountAOut(uint256 newABPrice, uint256 poolBIn)
        internal
        view
        returns (uint256 amountAOut, uint256 newPrice)
    {
        (uint256 poolAmountA, uint256 poolAmountB) = _getPoolAmounts(newABPrice);
        uint256 productConstant = poolAmountA.mul(poolAmountB);
        amountAOut = poolAmountA.sub(productConstant.div(poolAmountB.add(poolBIn)));
        newPrice = poolAmountB.add(poolBIn).mul(10**uint256(tokenADecimals())).div(poolAmountA.sub(amountAOut));
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
        uint256 spotPrice = _getSpotPrice(priceProperties.underlyingAsset, PRICING_DECIMALS);
        uint256 timeToMaturity = _getTimeToMaturityInYears();

        uint256 newABPrice = _calculateNewABPrice(spotPrice, timeToMaturity);
        if (newABPrice == 0) {
            return (0, 0, 0, 0);
        }

        uint256 feesTokenA = feePoolA.getCollectable(exactAmountBOut);
        uint256 feesTokenB = feePoolB.getCollectable(exactAmountBOut);

        (uint256 amountAInPool, uint256 newTargetABPrice) = _getAmountAIn(
            exactAmountBOut,
            feesTokenA,
            feesTokenB,
            newABPrice
        );

        if (!_isValidTargetPrice(newTargetABPrice, spotPrice)) {
            return (0, 0, 0, 0);
        }

        uint256 newIV = _getNewIV(newTargetABPrice, spotPrice, timeToMaturity, priceProperties);

        return (amountAInPool, newIV, feesTokenA, feesTokenB);
    }

    function _getAmountAIn(
        uint256 exactAmountBOut,
        uint256 feesTokenA,
        uint256 feesTokenB,
        uint256 newABPrice
    ) internal view returns (uint256 amountAInPool, uint256 newPrice) {
        (uint256 poolAmountA, uint256 poolAmountB) = _getPoolAmounts(newABPrice);
        uint256 productConstant = poolAmountA.mul(poolAmountB);
        uint256 poolBOut = exactAmountBOut.add(feesTokenA).add(feesTokenB);
        amountAInPool = productConstant.div(poolAmountB.sub(poolBOut)).sub(poolAmountA);
        newPrice = poolAmountB.sub(poolBOut).mul(10**uint256(tokenADecimals())).div(poolAmountA.add(amountAInPool));
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

    function _isValidTargetPrice(uint256 newTargetPrice, uint256 spotPrice) internal view returns (bool) {
        if (priceProperties.optionType == IPodOption.OptionType.PUT) {
            if (spotPrice < priceProperties.strikePrice) {
                return
                    newTargetPrice >
                    priceProperties.strikePrice.sub(spotPrice).div(10**PRICING_DECIMALS.sub(tokenBDecimals()));
            }
        } else {
            if (spotPrice > priceProperties.strikePrice) {
                return
                    newTargetPrice >
                    spotPrice.sub(priceProperties.strikePrice).div(10**PRICING_DECIMALS.sub(tokenBDecimals()));
            }
        }
        return true;
    }

    function _onAddLiquidity(UserDepositSnapshot memory _userDepositSnapshot, address owner) internal override {
        uint256 currentQuotesA = feePoolA.sharesOf(owner);
        uint256 currentQuotesB = feePoolB.sharesOf(owner);
        uint256 amountOfQuotesAToAdd = 0;
        uint256 amountOfQuotesBToAdd = 0;

        uint256 totalQuotesA = _userDepositSnapshot.tokenABalance.mul(10**FIMP_DECIMALS).div(_userDepositSnapshot.fImp);

        if (totalQuotesA > currentQuotesA) {
            amountOfQuotesAToAdd = totalQuotesA.sub(currentQuotesA);
        }

        uint256 totalQuotesB = _userDepositSnapshot.tokenBBalance.mul(10**FIMP_DECIMALS).div(_userDepositSnapshot.fImp);

        if (totalQuotesB > currentQuotesB) {
            amountOfQuotesBToAdd = totalQuotesB.sub(currentQuotesB);
        }

        feePoolA.mint(owner, amountOfQuotesAToAdd);
        feePoolB.mint(owner, amountOfQuotesBToAdd);
    }

    function _onRemoveLiquidity(UserDepositSnapshot memory _userDepositSnapshot, address owner) internal override {
        uint256 currentQuotesA = feePoolA.sharesOf(owner);
        uint256 currentQuotesB = feePoolB.sharesOf(owner);

        uint256 amountOfQuotesAToRemove = currentQuotesA.sub(
            _userDepositSnapshot.tokenABalance.mul(10**FIMP_DECIMALS).div(_userDepositSnapshot.fImp)
        );
        uint256 amountOfQuotesBToRemove = currentQuotesB.sub(
            _userDepositSnapshot.tokenBBalance.mul(10**FIMP_DECIMALS).div(_userDepositSnapshot.fImp)
        );

        if (amountOfQuotesAToRemove > 0) {
            feePoolA.withdraw(owner, amountOfQuotesAToRemove);
        }
        if (amountOfQuotesBToRemove > 0) {
            feePoolB.withdraw(owner, amountOfQuotesBToRemove);
        }
    }

    function _onTrade(TradeDetails memory tradeDetails) internal {
        uint256 newSigma = abi.decode(tradeDetails.params, (uint256));
        priceProperties.currentSigma = newSigma;

        IERC20(tokenB()).safeTransfer(address(feePoolA), tradeDetails.feesTokenA);
        IERC20(tokenB()).safeTransfer(address(feePoolB), tradeDetails.feesTokenB);
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

    function _emergencyStopCheck() private view {
        IEmergencyStop emergencyStop = IEmergencyStop(configurationManager.getEmergencyStop());
        require(
            !emergencyStop.isStopped(configurationManager.getPriceProvider()) &&
                !emergencyStop.isStopped(configurationManager.getPricingMethod()) &&
                !emergencyStop.isStopped(configurationManager.getImpliedVolatility()),
            "Pool: Pool is stopped"
        );
    }
}
