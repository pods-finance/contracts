// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "./lib/FixidityLib.sol";
import "./lib/LogarithmLib.sol";
import "./lib/ExponentLib.sol";
import "./lib/IntUtils.sol";
import "./NormalDistribution.sol";

/**
 * Black-Scholes calculus
 */
contract BlackScholes {
    using FixidityLib for int256;
    using ExponentLib for int256;
    using LogarithmLib for int256;
    using IntUtils for int256;

    NormalDistribution private N;

    uint256 private decimals;

    constructor() public {
        N = new NormalDistribution();
        decimals = 18;
    }

    /**
     * Calculate call option price
     *
     * @param spotPrice Asset spot price
     * @param strikePrice Option strike price
     * @param sigma Annually volatility on the asset price
     * @param daysRemaining Number of days remaining until maturity
     * @param riskFree The risk-free rate
     * @return call option price
     */
    function getCallPrice(
        int256 spotPrice,
        int256 strikePrice,
        int256 sigma,
        int256 daysRemaining,
        int256 riskFree
    )
        public
        view
        returns(int256)
    {
        int256 time = getTime(daysRemaining);

        (int256 Nd1, int256 Nd2) = getProbabilities(spotPrice, strikePrice, sigma, time, riskFree);

        int256 get = spotPrice.multiply(Nd1);
        int256 pay = strikePrice.multiply(Nd2);

        return get.subtract(pay);
    }

    /**
     * Calculate put option price
     *
     * @param spotPrice Asset spot price
     * @param strikePrice Option strike price
     * @param sigma Annually volatility on the asset price
     * @param daysRemaining Number of days remaining until maturity
     * @param riskFree The risk-free rate
     * @return put option price
     */
    function getPutPrice(
        int256 spotPrice,
        int256 strikePrice,
        int256 sigma,
        int256 daysRemaining,
        int256 riskFree
    )
        public
        view
        returns(int256)
    {
        int256 time = getTime(daysRemaining);

        (int256 Nd1, int256 Nd2) = getProbabilities(spotPrice, strikePrice, sigma, time, riskFree);

        int256 get = strikePrice.multiply(Nd2);
        int256 pay = spotPrice.multiply(Nd1);

        return get.subtract(pay);
    }

    /**
     * Get probabilities d1 and d2
     *
     ***********************************************************************************************
     * So = spotPrice                                                                             //
     * X  = strikePrice                              t ( r + ( σ² / 2 ) )                         //
     * σ  = sigma               d1 = ln( So / X ) + -----------------------                       //
     * t  = time                                         σ ( sqrt(t) )                            //
     * r  = riskFree                                                                              //
     *                          d2 = d1 - σ ( sqrt(t) )                                           //
     ***********************************************************************************************
     *
     * @param spotPrice Asset spot price
     * @param strikePrice Option strike price
     * @param sigma Annually volatility on the asset price
     * @param time Number of days remaining until maturity. In years
     * @param riskFree The risk-free rate
     */
    function getProbabilities(
        int256 spotPrice,
        int256 strikePrice,
        int256 sigma,
        int256 time,
        int256 riskFree
    )
        internal
        view
        returns(int256 Nd1, int256 Nd2)
    {
        int256 sqrtTime = time.sqrt().rightPad(decimals);

        int256 n = spotPrice.divide(strikePrice).cachedLn()
        .add((sigma.multiply(sigma) / 2).add(riskFree).multiply(time));

        int256 d = sigma.multiply(sqrtTime);
        int256 d1 = n.divide(d);
        int256 d2 = d1.subtract(d);

        Nd1 = N.getProbability(-d1, decimals);
        Nd2 = N.getProbability(-d2, decimals);

        return (Nd1, Nd2);
    }

    function getTime(int256 daysRemaining)
        internal
        view
        returns(int256)
    {
        return daysRemaining.divide(365 * int256(10 ** decimals));
    }

//    function test() public view returns(int256) {
//        int256 spotPrice =    368000000000000000000000000;
//        int256 strikePrice =  320000000000000000000000000;
//        int256 sigma =          1180000000000000000000000;
//        int256 riskFree =       0;
//        int256 daysRemaining =    6500000000000000000000000;
//
//        return getPutPrice(spotPrice, strikePrice, sigma, daysRemaining, riskFree);
//    }
}
