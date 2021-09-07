// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./AMM.sol";
import "../lib/CappedPool.sol";
import "../lib/CombinedActionsGuard.sol";
import "../interfaces/IPriceProvider.sol";
import "../interfaces/IIVProvider.sol";
import "../interfaces/IBlackScholes.sol";
import "../interfaces/IIVGuesser.sol";
import "../interfaces/IPodOption.sol";
import "../interfaces/IOptionAMMPool.sol";
import "../interfaces/IFeePool.sol";
import "../interfaces/IConfigurationManager.sol";
import "../interfaces/IEmergencyStop.sol";
import "../interfaces/IFeePoolBuilder.sol";
import "../options/rewards/AaveIncentives.sol";

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
 *     implied Volatility
 * - feePoolA and feePoolB: responsible for handling Liquidity providers fees.
 */

contract OptionAMMPool is AMM, IOptionAMMPool, CappedPool, CombinedActionsGuard, ReentrancyGuard, AaveIncentives {
    using SafeMath for uint256;
    uint256 public constant PRICING_DECIMALS = 18;
    uint256 private constant _SECONDS_IN_A_YEAR = 31536000;
    uint256 private constant _ORACLE_IV_WEIGHT = 3;
    uint256 private constant _POOL_IV_WEIGHT = 1;

    // External Contracts
    /**
     * @notice store globally accessed configurations
     */
    IConfigurationManager public immutable configurationManager;

    /**
     * @notice responsible for handling Liquidity providers fees of the token A
     */
    IFeePool public immutable feePoolA;

    /**
     * @notice responsible for handling Liquidity providers fees of the token B
     */
    IFeePool public immutable feePoolB;

    // Option Info
    struct PriceProperties {
        uint256 expiration;
        uint256 startOfExerciseWindow;
        uint256 strikePrice;
        address underlyingAsset;
        IPodOption.OptionType optionType;
        uint256 currentIV;
        int256 riskFree;
        uint256 initialIVGuess;
    }

    /**
     * @notice priceProperties are all information needed to handle the price discovery method
     * most of the properties will be used by getABPrice
     */
    PriceProperties public priceProperties;

    event TradeInfo(uint256 spotPrice, uint256 newIV);

    constructor(
        address _optionAddress,
        address _stableAsset,
        uint256 _initialIV,
        IConfigurationManager _configurationManager,
        IFeePoolBuilder _feePoolBuilder
    ) public AMM(_optionAddress, _stableAsset) CappedPool(_configurationManager) AaveIncentives(_configurationManager) {
        require(
            IPodOption(_optionAddress).exerciseType() == IPodOption.ExerciseType.EUROPEAN,
            "Pool: invalid exercise type"
        );

        feePoolA = _feePoolBuilder.buildFeePool(_stableAsset, 10, 3, address(this));
        feePoolB = _feePoolBuilder.buildFeePool(_stableAsset, 10, 3, address(this));

        priceProperties.currentIV = _initialIV;
        priceProperties.initialIVGuess = _initialIV;
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
        require(msg.sender == configurationManager.getOptionHelper() || msg.sender == owner, "AMM: invalid sender");
        _nonCombinedActions();
        _beforeStartOfExerciseWindow();
        _emergencyStopCheck();
        _addLiquidity(amountOfA, amountOfB, owner);
        _emitTradeInfo();
    }

    /**
     * @notice removeLiquidity in any proportion of tokenA or tokenB
     *
     * @param amountOfA amount of TokenA to add
     * @param amountOfB amount of TokenB to add
     */
    function removeLiquidity(uint256 amountOfA, uint256 amountOfB) external override nonReentrant {
        _nonCombinedActions();
        _emergencyStopCheck();
        _removeLiquidity(amountOfA, amountOfB);
        _emitTradeInfo();
    }

    /**
     * @notice withdrawRewards claims reward from Aave and send to admin
     * @dev should only be called by the admin power
     *
     */
    function withdrawRewards() external override {
        require(msg.sender == configurationManager.owner(), "not owner");
        address[] memory assets = new address[](1);
        assets[0] = this.tokenB();

        _claimRewards(assets);

        address rewardAsset = _parseAddressFromUint(configurationManager.getParameter("REWARD_ASSET"));
        uint256 rewardsToSend = _rewardBalance();

        IERC20(rewardAsset).safeTransfer(msg.sender, rewardsToSend);
    }

    /**
     * @notice tradeExactAInput msg.sender is able to trade exact amount of token A in exchange for minimum
     * amount of token B and send the tokens B to the owner. After that, this function also updates the
     * priceProperties.* currentIV
     *
     * @dev initialIVGuess is a parameter for gas saving costs purpose. Instead of calculating the new implied volatility
     * out of thin ar, caller can help the Numeric Method achieve the result in less iterations with this parameter.
     * In order to know which guess the caller should use, call the getOptionTradeDetailsExactAInput first.
     *
     * @param exactAmountAIn exact amount of A token that will be transfer from msg.sender
     * @param minAmountBOut minimum acceptable amount of token B to transfer to owner
     * @param owner the destination address that will receive the token B
     * @param initialIVGuess The first guess that the Numeric Method (getPutIV / getCallIV) should use
     */
    function tradeExactAInput(
        uint256 exactAmountAIn,
        uint256 minAmountBOut,
        address owner,
        uint256 initialIVGuess
    ) external override nonReentrant returns (uint256) {
        _nonCombinedActions();
        _beforeStartOfExerciseWindow();
        _emergencyStopCheck();
        priceProperties.initialIVGuess = initialIVGuess;

        uint256 amountBOut = _tradeExactAInput(exactAmountAIn, minAmountBOut, owner);

        _emitTradeInfo();
        return amountBOut;
    }

    /**
     * @notice _tradeExactAOutput owner is able to receive exact amount of token A in exchange of a max
     * acceptable amount of token B transfer from the msg.sender. After that, this function also updates
     * the priceProperties.currentIV
     *
     * @dev initialIVGuess is a parameter for gas saving costs purpose. Instead of calculating the new implied volatility
     * out of thin ar, caller can help the Numeric Method achieve the result in less iterations with this parameter.
     * In order to know which guess the caller should use, call the getOptionTradeDetailsExactAOutput first.
     *
     * @param exactAmountAOut exact amount of token A that will be transfer to owner
     * @param maxAmountBIn maximum acceptable amount of token B to transfer from msg.sender
     * @param owner the destination address that will receive the token A
     * @param initialIVGuess The first guess that the Numeric Method (getPutIV / getCallIV) should use
     */
    function tradeExactAOutput(
        uint256 exactAmountAOut,
        uint256 maxAmountBIn,
        address owner,
        uint256 initialIVGuess
    ) external override nonReentrant returns (uint256) {
        _nonCombinedActions();
        _beforeStartOfExerciseWindow();
        _emergencyStopCheck();
        priceProperties.initialIVGuess = initialIVGuess;

        uint256 amountBIn = _tradeExactAOutput(exactAmountAOut, maxAmountBIn, owner);

        _emitTradeInfo();
        return amountBIn;
    }

    /**
     * @notice _tradeExactBInput msg.sender is able to trade exact amount of token B in exchange for minimum
     * amount of token A sent to the owner. After that, this function also updates the priceProperties.currentIV
     *
     * @dev initialIVGuess is a parameter for gas saving costs purpose. Instead of calculating the new implied volatility
     * out of thin ar, caller can help the Numeric Method achieve the result ini less iterations with this parameter.
     * In order to know which guess the caller should use, call the getOptionTradeDetailsExactBInput first.
     *
     * @param exactAmountBIn exact amount of token B that will be transfer from msg.sender
     * @param minAmountAOut minimum acceptable amount of token A to transfer to owner
     * @param owner the destination address that will receive the token A
     * @param initialIVGuess The first guess that the Numeric Method (getPutIV / getCallIV) should use
     */
    function tradeExactBInput(
        uint256 exactAmountBIn,
        uint256 minAmountAOut,
        address owner,
        uint256 initialIVGuess
    ) external override nonReentrant returns (uint256) {
        _nonCombinedActions();
        _beforeStartOfExerciseWindow();
        _emergencyStopCheck();
        priceProperties.initialIVGuess = initialIVGuess;

        uint256 amountAOut = _tradeExactBInput(exactAmountBIn, minAmountAOut, owner);

        _emitTradeInfo();
        return amountAOut;
    }

    /**
     * @notice _tradeExactBOutput owner is able to receive exact amount of token B in exchange of a max
     * acceptable amount of token A transfer from msg.sender. After that, this function also updates the
     * priceProperties.currentIV
     *
     * @dev initialIVGuess is a parameter for gas saving costs purpose. Instead of calculating the new implied volatility
     * out of thin ar, caller can help the Numeric Method achieve the result ini less iterations with this parameter.
     * In order to know which guess the caller should use, call the getOptionTradeDetailsExactBOutput first.
     *
     * @param exactAmountBOut exact amount of token B that will be transfer to owner
     * @param maxAmountAIn maximum acceptable amount of token A to transfer from msg.sender
     * @param owner the destination address that will receive the token B
     * @param initialIVGuess The first guess that the Numeric Method (getPutIV / getCallIV) should use
     */
    function tradeExactBOutput(
        uint256 exactAmountBOut,
        uint256 maxAmountAIn,
        address owner,
        uint256 initialIVGuess
    ) external override nonReentrant returns (uint256) {
        _nonCombinedActions();
        _beforeStartOfExerciseWindow();
        _emergencyStopCheck();
        priceProperties.initialIVGuess = initialIVGuess;

        uint256 amountAIn = _tradeExactBOutput(exactAmountBOut, maxAmountAIn, owner);

        _emitTradeInfo();
        return amountAIn;
    }

    /**
     * @notice getRemoveLiquidityAmounts external function that returns the available for rescue
     * amounts of token A, and token B based on the original position
     *
     * @param percentA percent of exposition of Token A to be removed
     * @param percentB percent of exposition of Token B to be removed
     * @param user Opening Value Factor by the moment of the deposit
     *
     * @return withdrawAmountA the total amount of token A that will be rescued
     * @return withdrawAmountB the total amount of token B that will be rescued plus fees
     */
    function getRemoveLiquidityAmounts(
        uint256 percentA,
        uint256 percentB,
        address user
    ) external override view returns (uint256 withdrawAmountA, uint256 withdrawAmountB) {
        (uint256 poolWithdrawAmountA, uint256 poolWithdrawAmountB) = _getRemoveLiquidityAmounts(
            percentA,
            percentB,
            user
        );
        (uint256 feeSharesA, uint256 feeSharesB) = _getAmountOfFeeShares(percentA, percentB, user);
        uint256 feesWithdrawAmountA = 0;
        uint256 feesWithdrawAmountB = 0;

        if (feeSharesA > 0) {
            (, feesWithdrawAmountA) = feePoolA.getWithdrawAmount(user, feeSharesA);
        }

        if (feeSharesB > 0) {
            (, feesWithdrawAmountB) = feePoolB.getWithdrawAmount(user, feeSharesB);
        }

        withdrawAmountA = poolWithdrawAmountA;
        withdrawAmountB = poolWithdrawAmountB.add(feesWithdrawAmountA).add(feesWithdrawAmountB);
        return (withdrawAmountA, withdrawAmountB);
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
     * @notice getAdjustedIV This function will return the adjustedIV, which is an average
     * between the pool IV and an external oracle IV
     *
     * @return adjustedIV The average between pool's IV and external oracle IV
     */
    function getAdjustedIV() external override view returns (uint256 adjustedIV) {
        return _getAdjustedIV(tokenA(), priceProperties.currentIV);
    }

    /**
     * @notice getOptionTradeDetailsExactAInput view function that simulates a trade, in order the preview
     * the amountBOut, the new implied volatility, that will be used as the initialIVGuess if caller wants to perform
     * a trade in sequence. Also returns the amount of Fees that will be payed to liquidity pools A and B.
     *
     * @param exactAmountAIn amount of token A that will by transfer from msg.sender to the pool
     *
     * @return amountBOut amount of B in exchange of the exactAmountAIn
     * @return newIV the new implied volatility that this trade will result
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
     * the amountBIn, the new implied volatility, that will be used as the initialIVGuess if caller wants to perform
     * a trade in sequence. Also returns the amount of Fees that will be payed to liquidity pools A and B.
     *
     * @param exactAmountAOut amount of token A that will by transfer from pool to the msg.sender/owner
     *
     * @return amountBIn amount of B that will be transfer from msg.sender to the pool
     * @return newIV the new implied volatility that this trade will result
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
     * the amountAOut, the new implied volatility, that will be used as the initialIVGuess if caller wants to perform
     * a trade in sequence. Also returns the amount of Fees that will be payed to liquidity pools A and B.
     *
     * @param exactAmountBIn amount of token B that will by transfer from msg.sender to the pool
     *
     * @return amountAOut amount of A that will be transfer from contract to owner
     * @return newIV the new implied volatility that this trade will result
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
     * the amountAIn, the new implied volatility, that will be used as the initialIVGuess if caller wants to perform
     * a trade in sequence. Also returns the amount of Fees that will be payed to liquidity pools A and B.
     *
     * @param exactAmountBOut amount of token B that will by transfer from pool to the msg.sender/owner
     *
     * @return amountAIn amount of A that will be transfer from msg.sender to the pool
     * @return newIV the new implied volatility that this trade will result
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
        (uint256 newABPrice, uint256 spotPrice, uint256 timeToMaturity) = _getPriceDetails();
        if (newABPrice == 0) {
            return (0, 0, 0, 0);
        }

        (uint256 poolAmountA, uint256 poolAmountB) = _getPoolAmounts(newABPrice);

        uint256 amountBOutPool = _getAmountBOutPool(exactAmountAIn, poolAmountA, poolAmountB);
        uint256 newTargetABPrice = _getNewTargetPrice(newABPrice, exactAmountAIn, amountBOutPool, TradeDirection.AB);

        // Prevents the pool to sell an option under the minimum target price,
        // because it causes an infinite loop when trying to calculate newIV
        if (!_isValidTargetPrice(newTargetABPrice, spotPrice)) {
            return (0, 0, 0, 0);
        }

        uint256 newIV = _getNewIV(newTargetABPrice, spotPrice, timeToMaturity);

        uint256 feesTokenA = feePoolA.getCollectable(amountBOutPool, poolAmountB);
        uint256 feesTokenB = feePoolB.getCollectable(amountBOutPool, poolAmountB);

        uint256 amountBOutUser = amountBOutPool.sub(feesTokenA).sub(feesTokenB);

        return (amountBOutUser, newIV, feesTokenA, feesTokenB);
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
        (uint256 newABPrice, uint256 spotPrice, uint256 timeToMaturity) = _getPriceDetails();
        if (newABPrice == 0) {
            return (0, 0, 0, 0);
        }
        (uint256 poolAmountA, uint256 poolAmountB) = _getPoolAmounts(newABPrice);

        uint256 amountBInPool = _getAmountBInPool(exactAmountAOut, poolAmountA, poolAmountB);
        uint256 newTargetABPrice = _getNewTargetPrice(newABPrice, exactAmountAOut, amountBInPool, TradeDirection.BA);

        uint256 feesTokenA = feePoolA.getCollectable(amountBInPool, poolAmountB);
        uint256 feesTokenB = feePoolB.getCollectable(amountBInPool, poolAmountB);

        uint256 amountBInUser = amountBInPool.add(feesTokenA).add(feesTokenB);

        uint256 newIV = _getNewIV(newTargetABPrice, spotPrice, timeToMaturity);

        return (amountBInUser, newIV, feesTokenA, feesTokenB);
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
        (uint256 newABPrice, uint256 spotPrice, uint256 timeToMaturity) = _getPriceDetails();
        if (newABPrice == 0) {
            return (0, 0, 0, 0);
        }
        (uint256 poolAmountA, uint256 poolAmountB) = _getPoolAmounts(newABPrice);

        uint256 feesTokenA = feePoolA.getCollectable(exactAmountBIn, poolAmountB);
        uint256 feesTokenB = feePoolB.getCollectable(exactAmountBIn, poolAmountB);
        uint256 totalFees = feesTokenA.add(feesTokenB);

        uint256 poolBIn = exactAmountBIn.sub(totalFees);

        uint256 amountAOutPool = _getAmountAOutPool(poolBIn, poolAmountA, poolAmountB);
        uint256 newTargetABPrice = _getNewTargetPrice(newABPrice, amountAOutPool, poolBIn, TradeDirection.BA);

        uint256 newIV = _getNewIV(newTargetABPrice, spotPrice, timeToMaturity);

        return (amountAOutPool, newIV, feesTokenA, feesTokenB);
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
        (uint256 newABPrice, uint256 spotPrice, uint256 timeToMaturity) = _getPriceDetails();
        if (newABPrice == 0) {
            return (0, 0, 0, 0);
        }
        (uint256 poolAmountA, uint256 poolAmountB) = _getPoolAmounts(newABPrice);

        uint256 feesTokenA = feePoolA.getCollectable(exactAmountBOut, poolAmountB);
        uint256 feesTokenB = feePoolB.getCollectable(exactAmountBOut, poolAmountB);
        uint256 totalFees = feesTokenA.add(feesTokenB);

        uint256 poolBOut = exactAmountBOut.add(totalFees);

        uint256 amountAInPool = _getAmountAInPool(poolBOut, poolAmountA, poolAmountB);
        uint256 newTargetABPrice = _getNewTargetPrice(newABPrice, amountAInPool, poolBOut, TradeDirection.AB);

        // Prevents the pool to sell an option under the minimum target price,
        // because it causes an infinite loop when trying to calculate newIV
        if (!_isValidTargetPrice(newTargetABPrice, spotPrice)) {
            return (0, 0, 0, 0);
        }

        uint256 newIV = _getNewIV(newTargetABPrice, spotPrice, timeToMaturity);

        return (amountAInPool, newIV, feesTokenA, feesTokenB);
    }

    function _getPriceDetails()
        internal
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        uint256 timeToMaturity = _getTimeToMaturityInYears();

        if (timeToMaturity == 0) {
            return (0, 0, 0);
        }

        uint256 spotPrice = _getSpotPrice(priceProperties.underlyingAsset, PRICING_DECIMALS);
        uint256 adjustedIV = _getAdjustedIV(tokenA(), priceProperties.currentIV);

        IBlackScholes pricingMethod = IBlackScholes(configurationManager.getPricingMethod());
        uint256 newABPrice;

        if (priceProperties.optionType == IPodOption.OptionType.PUT) {
            newABPrice = pricingMethod.getPutPrice(
                spotPrice,
                priceProperties.strikePrice,
                adjustedIV,
                timeToMaturity,
                priceProperties.riskFree
            );
        } else {
            newABPrice = pricingMethod.getCallPrice(
                spotPrice,
                priceProperties.strikePrice,
                adjustedIV,
                timeToMaturity,
                priceProperties.riskFree
            );
        }
        if (newABPrice == 0) {
            return (0, spotPrice, timeToMaturity);
        }
        uint256 newABPriceWithDecimals = newABPrice.div(10**(PRICING_DECIMALS.sub(tokenBDecimals())));
        return (newABPriceWithDecimals, spotPrice, timeToMaturity);
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
        (uint256 newABPrice, , ) = _getPriceDetails();
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

    function _getOracleIV(address optionAddress) internal view returns (uint256 normalizedOracleIV) {
        IIVProvider ivProvider = IIVProvider(configurationManager.getIVProvider());
        (, , uint256 oracleIV, uint256 ivDecimals) = ivProvider.getIV(optionAddress);
        uint256 diffDecimals;

        if (ivDecimals <= PRICING_DECIMALS) {
            diffDecimals = PRICING_DECIMALS.sub(ivDecimals);
        } else {
            diffDecimals = ivDecimals.sub(PRICING_DECIMALS);
        }
        return oracleIV.div(10**diffDecimals);
    }

    function _getAdjustedIV(address optionAddress, uint256 currentIV) internal view returns (uint256 adjustedIV) {
        uint256 oracleIV = _getOracleIV(optionAddress);

        adjustedIV = _ORACLE_IV_WEIGHT.mul(oracleIV).add(_POOL_IV_WEIGHT.mul(currentIV)).div(
            _POOL_IV_WEIGHT + _ORACLE_IV_WEIGHT
        );
    }

    function _getNewIV(
        uint256 newTargetABPrice,
        uint256 spotPrice,
        uint256 timeToMaturity
    ) internal view returns (uint256) {
        uint256 newTargetABPriceWithDecimals = newTargetABPrice.mul(10**(PRICING_DECIMALS.sub(tokenBDecimals())));
        uint256 newIV;
        IIVGuesser ivGuesser = IIVGuesser(configurationManager.getIVGuesser());
        if (priceProperties.optionType == IPodOption.OptionType.PUT) {
            (newIV, ) = ivGuesser.getPutIV(
                newTargetABPriceWithDecimals,
                priceProperties.initialIVGuess,
                spotPrice,
                priceProperties.strikePrice,
                timeToMaturity,
                priceProperties.riskFree
            );
        } else {
            (newIV, ) = ivGuesser.getCallIV(
                newTargetABPriceWithDecimals,
                priceProperties.initialIVGuess,
                spotPrice,
                priceProperties.strikePrice,
                timeToMaturity,
                priceProperties.riskFree
            );
        }
        return newIV;
    }

    /**
     * @dev After it gets the unit BlackScholes price, it applies slippage based on the minimum available in the pool
     * (returned by the _getPoolAmounts()) and the product constant curve.
     * @param amountBOutPool The exact amount of tokenB will leave the pool
     * @param poolAmountA The amount of A available for trade
     * @param poolAmountB The amount of B available for trade
     * @return amountAInPool The amount of tokenA(options) will enter the pool
     */
    function _getAmountAInPool(
        uint256 amountBOutPool,
        uint256 poolAmountA,
        uint256 poolAmountB
    ) internal pure returns (uint256 amountAInPool) {
        uint256 productConstant = poolAmountA.mul(poolAmountB);
        require(amountBOutPool < poolAmountB, "AMM: insufficient liquidity");
        amountAInPool = productConstant.div(poolAmountB.sub(amountBOutPool)).sub(poolAmountA);
    }

    /**
     * @dev After it gets the unit BlackScholes price, it applies slippage based on the minimum available in the pool
     * (returned by the _getPoolAmounts()) and the product constant curve.
     * @param amountBInPool The exact amount of tokenB will enter the pool
     * @param poolAmountA The amount of A available for trade
     * @param poolAmountB The amount of B available for trade
     * @return amountAOutPool The amount of tokenA(options) will leave the pool
     */
    function _getAmountAOutPool(
        uint256 amountBInPool,
        uint256 poolAmountA,
        uint256 poolAmountB
    ) internal pure returns (uint256 amountAOutPool) {
        uint256 productConstant = poolAmountA.mul(poolAmountB);
        amountAOutPool = poolAmountA.sub(productConstant.div(poolAmountB.add(amountBInPool)));
    }

    /**
     * @dev After it gets the unit BlackScholes price, it applies slippage based on the minimum available in the pool
     * (returned by the _getPoolAmounts()) and the product constant curve.
     * @param amountAOutPool The amount of tokenA(options) will leave the pool
     * @param poolAmountA The amount of A available for trade
     * @param poolAmountB The amount of B available for trade
     * @return amountBInPool The amount of tokenB will enter the pool
     */
    function _getAmountBInPool(
        uint256 amountAOutPool,
        uint256 poolAmountA,
        uint256 poolAmountB
    ) internal pure returns (uint256 amountBInPool) {
        uint256 productConstant = poolAmountA.mul(poolAmountB);
        require(amountAOutPool < poolAmountA, "AMM: insufficient liquidity");
        amountBInPool = productConstant.div(poolAmountA.sub(amountAOutPool)).sub(poolAmountB);
    }

    /**
     * @dev After it gets the unit BlackScholes price, it applies slippage based on the minimum available in the pool
     * (returned by the _getPoolAmounts()) and the product constant curve.
     * @param amountAInPool The exact amount of tokenA(options) will enter the pool
     * @param poolAmountA The amount of A available for trade
     * @param poolAmountB The amount of B available for trade
     * @return amountBOutPool The amount of tokenB will leave the pool
     */
    function _getAmountBOutPool(
        uint256 amountAInPool,
        uint256 poolAmountA,
        uint256 poolAmountB
    ) internal pure returns (uint256 amountBOutPool) {
        uint256 productConstant = poolAmountA.mul(poolAmountB);
        amountBOutPool = poolAmountB.sub(productConstant.div(poolAmountA.add(amountAInPool)));
    }

    /**
     * @dev Based on the tokensA and tokensB leaving or entering the pool, it is possible to calculate the new option
     * target price. That price will be used later to update the currentIV.
     * @param newABPrice calculated Black Scholes unit price (how many units of tokenB, to buy 1 tokenA(option))
     * @param amountA The amount of tokenA that will leave or enter the pool
     * @param amountB TThe amount of tokenB that will leave or enter the pool
     * @param tradeDirection The trade direction, if it is AB, means that tokenA will enter, and tokenB will leave.
     * @return newTargetPrice The new unit target price (how many units of tokenB, to buy 1 tokenA(option))
     */
    function _getNewTargetPrice(
        uint256 newABPrice,
        uint256 amountA,
        uint256 amountB,
        TradeDirection tradeDirection
    ) internal view returns (uint256 newTargetPrice) {
        (uint256 poolAmountA, uint256 poolAmountB) = _getPoolAmounts(newABPrice);
        if (tradeDirection == TradeDirection.AB) {
            newTargetPrice = poolAmountB.sub(amountB).mul(10**uint256(tokenADecimals())).div(poolAmountA.add(amountA));
        } else {
            newTargetPrice = poolAmountB.add(amountB).mul(10**uint256(tokenADecimals())).div(poolAmountA.sub(amountA));
        }
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

    /**
     * @dev If a option is ITM, either PUTs or CALLs, the minimum price that it would cost is the difference between
     * the spot price and strike price. If the target price after applying slippage is above this minimum, the function
     * returns true.
     * @param newTargetPrice the new ABPrice after slippage (how many units of tokenB, to buy 1 option)
     * @param spotPrice current underlying asset spot price during this transaction
     * @return true if is a valid target price (above the minimum)
     */
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

    function _onRemoveLiquidity(
        uint256 percentA,
        uint256 percentB,
        address owner
    ) internal override {
        (uint256 amountOfSharesAToRemove, uint256 amountOfSharesBToRemove) = _getAmountOfFeeShares(
            percentA,
            percentB,
            owner
        );

        if (amountOfSharesAToRemove > 0) {
            feePoolA.withdraw(owner, amountOfSharesAToRemove);
        }
        if (amountOfSharesBToRemove > 0) {
            feePoolB.withdraw(owner, amountOfSharesBToRemove);
        }
    }

    function _getAmountOfFeeShares(
        uint256 percentA,
        uint256 percentB,
        address owner
    ) internal view returns (uint256, uint256) {
        uint256 currentSharesA = feePoolA.sharesOf(owner);
        uint256 currentSharesB = feePoolB.sharesOf(owner);

        uint256 amountOfSharesAToRemove = currentSharesA.mul(percentA).div(PERCENT_PRECISION);
        uint256 amountOfSharesBToRemove = currentSharesB.mul(percentB).div(PERCENT_PRECISION);

        return (amountOfSharesAToRemove, amountOfSharesBToRemove);
    }

    function _onTrade(TradeDetails memory tradeDetails) internal override {
        uint256 newIV = abi.decode(tradeDetails.params, (uint256));
        priceProperties.currentIV = newIV;

        IERC20(tokenB()).safeTransfer(address(feePoolA), tradeDetails.feesTokenA);
        IERC20(tokenB()).safeTransfer(address(feePoolB), tradeDetails.feesTokenB);
    }

    /**
     * @dev Check for functions which are only allowed to be executed
     * BEFORE start of exercise window.
     */
    function _beforeStartOfExerciseWindow() internal view {
        require(block.timestamp < priceProperties.startOfExerciseWindow, "Pool: exercise window has started");
    }

    function _emergencyStopCheck() private view {
        IEmergencyStop emergencyStop = IEmergencyStop(configurationManager.getEmergencyStop());
        require(
            !emergencyStop.isStopped(address(this)) &&
                !emergencyStop.isStopped(configurationManager.getPriceProvider()) &&
                !emergencyStop.isStopped(configurationManager.getPricingMethod()),
            "Pool: Pool is stopped"
        );
    }

    function _emitTradeInfo() private {
        uint256 spotPrice = _getSpotPrice(priceProperties.underlyingAsset, PRICING_DECIMALS);
        emit TradeInfo(spotPrice, priceProperties.currentIV);
    }
}
