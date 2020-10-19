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

    // function removeLiquidity(uint256 amountOfStable, uint256 amountOfOptions) public {
    //     // 2) Calculate Totals
    //     (uint256 normalizedTotalStable, uint256 normalizedtotalOptions) = _getPoolBalances();
    //     require(amountOfStable <= totalStable && amountOfOptions <= totalOptions, "not enough liquidity");
    //     // 1) Spot Price
    //     spotPrice = priceProvider.getAssetPrice(underlyingAsset);
    //     // fImp = (totalOptions*spotPrice + totalStable) / (deamortizedOption*spotPrice + deamortizedStable)
    //     fImpOpening = totalOptions.mul(spotPrice).add(totalStable).div(
    //         deamortizedOptionBalance.mul(spotPrice).add(deamortizedStableBalance)
    //     );

    //     Mult memory multipliers = _getMultipliers(totalStable, totalOptions, fImpOpening);

    //     (uint256 optionAmountAvaiableForRescue, uint256 stableAmountAvaiableForRescue) = _getAvaiableForRescueAmounts(
    //         balances[msg.sender].optionBalance,
    //         balances[msg.sender].stableBalance,
    //         balances[msg.sender].fImp,
    //         multipliers
    //     );

    //     require(
    //         amountOfStable < stableAmountAvaiableForRescue && amountOfOptions < optionAmountAvaiableForRescue,
    //         "Not enough liquidity for rescue"
    //     );

    //     (uint256 qA, uint256 qB) = _getNewAmortizedBalances(multipliers, amountOfStable, amountOfOptions);

    //     // 4) Update users properties
    //     balances[msg.sender].optionBalance = balances[msg.sender].optionBalance.sub(qA.mul(balances[msg.sender].fImp));
    //     balances[msg.sender].stableBalance = balances[msg.sender].stableBalance.sub(qB.mul(balances[msg.sender].fImp));
    //     // 5) Generate impact on multipliers

    //     //6) Update deamortized Pool Balances
    //     deamortizedOptionBalance = deamortizedOptionBalance.sub(qA);
    //     deamortizedStableBalance = deamortizedStableBalance.sub(qB);

    //     // 5. transferFrom(amountA) / transferFrom(amountB) = > Already updates the new balanceOf(a) / balanceOf(b)
    //     require(ERC20(option).transfer(msg.sender, amountOfOptions), "Could not transfer option tokens from caller");

    //     require(
    //         ERC20(stableAsset).transfer(msg.sender, amountOfStable),
    //         "Could not transfer stable tokens from caller"
    //     );

    //     emit RemoveLiquidity(msg.sender, amountOfOptions, amountOfStable);
    // }

    function buyTokensWithExactTokens(
        uint256 amountOfTokensA,
        uint256 minAmountOfTokenB,
        TradeDirection direction,
        uint256 _sigmaInitialGuess
    ) public {
        priceProperties.sigmaInitialGuess = _sigmaInitialGuess;
        _buyTokensWithExactTokens(amountOfTokensA, minAmountOfTokenB, direction);
    }

    function _calculateNewABPrice(uint256 spotPrice, uint256 timeToMaturity) internal view returns (uint256) {
        uint256 newPrice = priceMethod.getPutPrice(
            int256(spotPrice),
            int256(priceProperties.strikePrice),
            priceProperties.currentSigma,
            timeToMaturity,
            int256(priceProperties.riskFree)
        );
        return newABPrice;
    }

    // returns maturity in years with 18 decimals
    function _getTimeToMaturityInYears() internal view returns (uint256) {
        return ((priceProperties.expiration - block.timestamp) * (10**BS_RES_DECIMALS)) / (SECONDS_IN_A_YEAR);
    }

    function _getPoolAmounts(newABPrice) internal view returns (uint256, uint256) {
        (uint256 totalAmountA, uint256 totalAmountB) = _getPoolBalances();
        uint256 poolAmountA = min(totalAmountA, totalAmountB.mul(10**tokenADecimals).div(newABPrice));
        uint256 poolAmountB = min(totalAmountB, totalAmountA.mul(newABPrice).div(10**tokenADecimals));
        return (poolAmountA, poolAmountB);
    }

    function _getAmountOut(
        uint256 newABPrice,
        uint256 amountIn,
        TradeDirection direction
    ) internal view returns (uint256) {
        (uint256 poolAmountA, uint256 poolAmountB) = _getPoolAmounts(newABPrice);
        uint256 productConstant = poolAmountA.mul(poolAmountB);

        uint256 amountOut = direction == TradeDirection.AB
            ? poolAmountB.sub(productConstant.div(poolAmountA.add(amountIn)))
            : poolAmountA.sub(productConstant.div(poolAmountB.add(amountIn)));

        return amountOut;
    }

    function _getAmountIn(
        uint256 newABPrice,
        uint256 amountOut,
        TradeDirection direction
    ) internal view returns (uint256) {
        (uint256 poolAmountA, uint256 poolAmountB) = _getPoolAmounts(newABPrice);
        uint256 productConstant = poolAmountA.mul(poolAmountB);

        uint256 amountInPool = direction == TradeDirection.AB
            ? productConstant.div(poolAmountB.sub(amountOut)).sub(poolAmountA)
            : productConstant.div(poolAmountA.sub(amountOut)).sub(poolAmountB);

        return amountInPool;
    }

    function _getABPrice() internal override view returns (uint256) {
        uint256 spotPrice = _getSpotPrice(priceProperties.underlyingAsset, BS_RES_DECIMALS);
        uint256 timeToMaturity = _getTimeToMaturityInYears();

        uint256 newABPRice = _calculateNewPrice(spotPrice, timeToMaturity);
        uint256 newABPriceWithDecimals = newABPRice.div(10**(BS_RES_DECIMALS.sub(tokenBDecimals)));
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

    function buyExactInput(
        uint256 amount,
        uint256 minOptionBought,
        uint256 sigmaInitialGuess
    ) external {
        // TODO
    }

    function getOptionTradeDetails(
        uint256 amount,
        TradeDirection direction,
        TradeType tradeType
    ) public view returns (uint256, uint256) {
        return _getOptionTradeDetails(amount, direction, tradeType);
    }

    function _getOptionTradeDetails(
        uint256 amount,
        TradeDirection direction,
        TradeType tradeType
    ) internal view returns (uint256, uint256) {
        uint256 amountIn;
        uint256 anountOut;
        uint256 returnAmount;
        uint256 fees;

        uint256 spotPrice = _getSpotPrice(priceProperties.underlyingAsset, BS_RES_DECIMALS);
        uint256 timeToMaturity = _getTimeToMaturityInYears();

        uint256 newABPrice = _calculateNewABPrice(spotPrice, timeToMaturity);

        if (tradeType == TradeType.In) {
            amountIn = amount;
            amountOut = _getAmountOut(newABPrice, amountIn);
            returnAmount = amountOut;
        } else {
            amountOut = amount;
            amountIn = _getAmountIn(newABPrice, amountOut);
            returnAmount = amountIn;
        }

        uint256 newTargetABPrice = direction == TradeDirection.AB
            ? amountOut.mul(10**tokenADecimals).div(amountIn)
            : amountIn.mul(10**tokenADecimals).div(amountOut);

        (uint256 newIV, ) = impliedVolatility.getPutSigma(
            newTargetABPrice,
            priceProperties.sigmaInitialGuess,
            spotPrice,
            priceProperties.strikePrice,
            timeToMaturity,
            priceProperties.riskFree
        );

        return (returnAmount, newIV, fees);
    }

    // function _getOptionTradeDetailsIn(uint256 tokensIn, TradeDirection direction)
    //     internal
    //     view
    //     returns (uint256, uint256)
    // {
    //     uint256 spotPrice = _getSpotPrice(priceProperties.underlyingAsset, BS_RES_DECIMALS);
    //     uint256 timeToMaturity = _getTimeToMaturityInYears();

    //     uint256 newABPrice = _calculateNewPrice(spotPrice, timeToMaturity);

    //     uint256 tokensOut = _getTokensOut(newABPrice, tokensIn, direction);

    //     uint256 newTargetPrice = direction == TradeDirection.AB
    //         ? tokensOut.mul(10**tokenADecimals).div(tokensIn)
    //         : tokensIn.mul(10**tokenADecimals).div(tokensOut);

    //     (uint256 newIV, ) = impliedVolatility.getPutSigma(
    //         newTargetPrice,
    //         priceProperties.sigmaInitialGuess,
    //         spotPrice,
    //         priceProperties.strikePrice,
    //         timeToMaturity,
    //         priceProperties.riskFree
    //     );
    //     return (tokensOut, newIV);
    // }

    function _getTradeDetails(
        uint256 amount,
        TradeDirection direction,
        TradeType tradeType
    ) internal override returns (TradeDetails memory) {
        (uint256 newIV, uint256 returnAmount) = _getOptionTradeDetails(amount, direction, tradeType);

        TradeDetails memory tradeDetails = TradeDetails(returnAmount, abi.encodePacked(newIV));
        return tradeDetails;
    }

    // function _getTradeDetailsIn(uint256 amountIn, TradeDirection direction)
    //     internal
    //     override
    //     returns (TradeDetails memory)
    // {
    //     (uint256 newIV, uint256 amountOut) = _getOptionTradeDetailsIn(amountIn, direction);

    //     TradeDetails memory tradeDetails = TradeDetails(amountOut, abi.encodePacked(newIV));
    //     return tradeDetails;
    // }

    function _onTrade(TradeDetails memory tradeDetails) internal override {
        (uint256 newSigma, uint256 fee) = abi.decode(tradeDetails.params, (uint256, uint256));
        priceProperties.currentSigma = newSigma;

        // transfere 1/2 fee pro contrato A
        // transfere 1/2 fee pro contrato B
    }
}
