// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./AMM.sol";
import "../interfaces/IPriceProvider.sol";
import "../interfaces/IBlackScholes.sol";
import "../interfaces/ISigma.sol";
import "../interfaces/IPodOption.sol";
import "../interfaces/IOptionAMMPool.sol";

contract OptionAMMPool is
    AMM /*, IOptionAMMPool*/
{
    using SafeMath for uint256;
    uint256 constant INITIAL_SIGMA = 10**18;

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
        address _sigma
    ) public AMM(_optionAddress, _stableAsset) {
        priceProperties.currentSigma = INITIAL_SIGMA;
        priceProperties.strikePrice = IPodOption(_optionAddress).strikePrice();
        priceProperties.underlyingAsset = IPodOption(_optionAddress).underlyingAsset();
        priceProperties.expiration = IPodOption(_optionAddress).expiration();

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
        uint256 _sigmaInitialGuess
    ) public {
        priceProperties.sigmaInitialGuess = _sigmaInitialGuess;
        _buyTokensWithExactTokens(amountOfTokensA, minAmountOfTokenB);
    }

    function _calculateNewPrice(uint256 spotPrice, uint256 timeToMaturity) internal view returns (uint256) {
        uint256 newPrice = priceMethod.getPutPrice(
            int256(spotPrice),
            int256(priceProperties.strikePrice),
            priceProperties.currentSigma,
            timeToMaturity,
            int256(priceProperties.riskFree)
        );
        return newPrice;
    }

    function _getTimeToMaturity() internal view returns (uint256) {
        return priceProperties.expiration - block.timestamp;
    }

    function _getTokenBOut(uint256 newPrice, uint256 amountIn) internal view returns (uint256) {
        (uint256 totalTokenA, uint256 totalTokenB) = _getPoolBalances();

        // 2a) Calculate Avaiable Pools
        uint256 poolTokenA = min(totalTokenA, totalTokenB.div(newPrice));
        uint256 poolTokenB = min(totalTokenB, totalTokenA.mul(newPrice));

        // 2c) Product Constant
        uint256 productConstant = poolTokenA.mul(poolTokenB);

        // 3. Calculate Paying/Receiving money => [(2c) / ((2) +/- amount) - (2b)]
        uint256 tokenBOut = productConstant.div(poolTokenA.sub(amountIn)).sub(poolTokenB);
        return tokenBOut;
    }

    function _getABPrice() internal override returns (uint256) {
        uint256 spotPrice = priceProvider.getAssetPrice(priceProperties.underlyingAsset);
        uint256 timeToMaturity = _getTimeToMaturity();

        uint256 newABPRice = _calculateNewPrice(spotPrice, timeToMaturity);
        return newABPRice;
    }

    function _getTradeDetails(uint256 amountIn) internal override returns (TradeDetails memory) {
        uint256 spotPrice = priceProvider.getAssetPrice(priceProperties.underlyingAsset);
        uint256 timeToMaturity = _getTimeToMaturity();

        uint256 newPrice = _calculateNewPrice(spotPrice, timeToMaturity);

        uint256 tokenBOut = _getTokenBOut(newPrice, amountIn);
        uint256 newTargetPrice = tokenBOut.div(amountIn);

        (uint256 newIV, ) = impliedVolatility.getPutSigma(
            newTargetPrice,
            priceProperties.sigmaInitialGuess,
            spotPrice,
            priceProperties.strikePrice,
            timeToMaturity,
            priceProperties.riskFree
        );

        TradeDetails memory tradeDetails = TradeDetails(tokenBOut, bytes32(newIV));
        return tradeDetails;
    }

    function _onTrade(TradeDetails memory tradeDetails) internal override {
        uint256 newSigma = uint256(tradeDetails.params);
        priceProperties.currentSigma = newSigma;
    }
}
