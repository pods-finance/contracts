// SPDX-License-Identifier: MIT
// solhint-disable var-name-mixedcase
pragma solidity ^0.6.8;

import "../interfaces/INormalDistribution.sol";

import "./lib/FixidityLib.sol";
import "./lib/LogarithmLib.sol";
import "./lib/ExponentLib.sol";

/**
 * Black-Scholes calculus
 */
contract BlackScholes {
    using FixidityLib for int256;
    using ExponentLib for int256;
    using LogarithmLib for int256;

    INormalDistribution public normalDistribution;

    uint8 public constant decimals = 18; // solhint-disable-line const-name-snakecase
    uint8 public constant precisionDecimals = 24; // solhint-disable-line const-name-snakecase

    uint256 public constant UNIT = 10**uint256(decimals);
    uint256 public constant PRECISION_UNIT = 10**uint256(precisionDecimals);

    uint256 public constant UNIT_TO_PRECISION_FACTOR = 10**uint256(precisionDecimals - decimals);

    constructor(address _normalDistribution) public {
        normalDistribution = INormalDistribution(_normalDistribution);
    }

    /**
     * Calculate call option price
     *
     * @param spotPrice Asset spot price
     * @param strikePrice Option strike price
     * @param sigma Annually volatility on the asset price
     * @param time Annualized time until maturity
     * @param riskFree The risk-free rate
     * @return call option price
     */
    function getCallPrice(
        int256 spotPrice,
        int256 strikePrice,
        uint256 sigma,
        uint256 time,
        int256 riskFree
    ) public view returns (uint256) {
        (int256 d1, int256 d2) = _getProbabilities(spotPrice, strikePrice, sigma, time, riskFree);

        int256 Nd1 = normalDistribution.getProbability(d1, precisionDecimals);
        int256 Nd2 = normalDistribution.getProbability(d2, precisionDecimals);

        int256 get = spotPrice.multiply(Nd1);
        int256 pay = strikePrice.multiply(Nd2);

        return uint256(get.subtract(pay));
    }

    /**
     * Calculate put option price
     *
     * @param spotPrice Asset spot price
     * @param strikePrice Option strike price
     * @param sigma Annually volatility on the asset price
     * @param time Annualized time until maturity
     * @param riskFree The risk-free rate
     * @return put option price
     */
    function getPutPrice(
        int256 spotPrice,
        int256 strikePrice,
        uint256 sigma,
        uint256 time,
        int256 riskFree
    ) public view returns (uint256) {
        (int256 d1, int256 d2) = _getProbabilities(spotPrice, strikePrice, sigma, time, riskFree);

        int256 Nd1 = normalDistribution.getProbability(-d1, precisionDecimals);
        int256 Nd2 = normalDistribution.getProbability(-d2, precisionDecimals);

        int256 get = strikePrice.multiply(Nd2);
        int256 pay = spotPrice.multiply(Nd1);

        return uint256(get.subtract(pay));
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
     * @param time Annualized time until maturity
     * @param riskFree The risk-free rate
     */
    function _getProbabilities(
        int256 spotPrice,
        int256 strikePrice,
        uint256 sigma,
        uint256 time,
        int256 riskFree
    ) internal pure returns (int256 Nd1, int256 Nd2) {
        int256 sigma2 = int256(_mul(_normalized(sigma), _normalized(sigma)) / PRECISION_UNIT);

        int256 A = _cachedLn(spotPrice.divide(strikePrice));
        int256 B = (sigma2 / 2).add(_normalized(riskFree)).multiply(_normalized(int256(time)));

        int256 n = A.add(B);

        uint256 sqrtTime = _sqrt(_normalized(time));
        uint256 d = _mul(sigma, sqrtTime) / UNIT_TO_PRECISION_FACTOR;

        int256 d1 = n.divide(int256(d));
        int256 d2 = d1.subtract(int256(d));

        return (d1, d2);
    }

    /**
     * Square root
     *
     * @param x The value
     * @return y The square root of x
     */
    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    /**
     * Same as natural logarithm but hard-coded for known x values
     * @param x The value to be ln
     * @return ln of x
     */
    function _cachedLn(int256 x) internal pure returns (int256) {
        return LogarithmLib.ln(x);
    }

    /**
     * @dev Returns the multiplication of two unsigned integers, reverting on
     * overflow.
     *
     * Counterpart to Solidity's `*` operator.
     *
     * Requirements:
     *
     * - Multiplication cannot overflow.
     */
    function _mul(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 c = a * b;
        require(c / a == b, "Multiplication overflow");

        return c;
    }

    /**
     * Normalizes uint numbers to precision uint
     */
    function _normalized(uint256 x) internal pure returns (uint256) {
        return x * UNIT_TO_PRECISION_FACTOR;
    }

    /**
     * Normalizes int numbers to precision int
     */
    function _normalized(int256 x) internal pure returns (int256) {
        return x * int256(UNIT_TO_PRECISION_FACTOR);
    }
}
