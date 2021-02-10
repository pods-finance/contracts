// SPDX-License-Identifier: MIT
// solhint-disable var-name-mixedcase
pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../interfaces/INormalDistribution.sol";

import "../lib/FixidityLib.sol";
import "../lib/LogarithmLib.sol";
import "../lib/ExponentLib.sol";
import "../interfaces/IBlackScholes.sol";
import "hardhat/console.sol";

/**
 * @title BlackScholes
 * @author Pods Finance
 * @notice Black-Scholes calculus
 */
contract BlackScholes is IBlackScholes {
    using SafeMath for uint256;
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
     * @notice Calculate call option price
     *
     * @param spotPrice Asset spot price
     * @param strikePrice Option strike price
     * @param sigma Annually volatility on the asset price
     * @param time Annualized time until maturity
     * @param riskFree The risk-free rate
     * @return call option price
     */
    function getCallPrice(
        uint256 spotPrice,
        uint256 strikePrice,
        uint256 sigma,
        uint256 time,
        int256 riskFree
    ) public override view returns (uint256) {
        (int256 d1, int256 d2) = _getProbabilities(int256(spotPrice), int256(strikePrice), sigma, time, riskFree);

        uint256 Nd1 = normalDistribution.getProbability(d1, precisionDecimals);
        uint256 Nd2 = normalDistribution.getProbability(d2, precisionDecimals);

        uint256 get = spotPrice.mul(Nd1).div(PRECISION_UNIT);
        uint256 pay = strikePrice.mul(Nd2).div(PRECISION_UNIT);

        if (pay > get) {
            // Negative numbers not allowed
            return 0;
        }

        return get.sub(pay);
    }

    /**
     * @notice Calculate put option price
     *
     * @param spotPrice Asset spot price
     * @param strikePrice Option strike price
     * @param sigma Annually volatility on the asset price
     * @param time Annualized time until maturity
     * @param riskFree The risk-free rate
     * @return put option price
     */
    function getPutPrice(
        uint256 spotPrice,
        uint256 strikePrice,
        uint256 sigma,
        uint256 time,
        int256 riskFree
    ) public override view returns (uint256) {
        (int256 d1, int256 d2) = _getProbabilities(int256(spotPrice), int256(strikePrice), sigma, time, riskFree);

        uint256 Nd1 = normalDistribution.getProbability(-d1, precisionDecimals);
        uint256 Nd2 = normalDistribution.getProbability(-d2, precisionDecimals);

        uint256 get = strikePrice.mul(Nd2).div(PRECISION_UNIT);
        uint256 pay = spotPrice.mul(Nd1).div(PRECISION_UNIT);

        if (pay > get) {
            // Negative numbers not allowed
            return 0;
        }

        return get.sub(pay);
    }

    /**
     * @dev Get probabilities d1 and d2
     *
     ***********************************************************************************************
     * So = spotPrice                                                                             //
     * X  = strikePrice              ln( So / X ) + t ( r + ( σ² / 2 ) )                          //
     * σ  = sigma               d1 = --------------------------------------                       //
     * t  = time                               σ ( sqrt(t) )                                      //
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
    ) internal pure returns (int256 d1, int256 d2) {
        int256 sigma2 = int256(_normalized(sigma).mul(_normalized(sigma)) / PRECISION_UNIT);

        int256 A = _cachedLn(spotPrice.divide(strikePrice));
        int256 B = (sigma2 / 2).add(_normalized(riskFree)).multiply(_normalized(int256(time)));

        int256 n = A.add(B);

        uint256 sqrtTime = _sqrt(_normalized(time));
        uint256 d = sigma.mul(sqrtTime) / UNIT_TO_PRECISION_FACTOR;

        d1 = n.divide(int256(d));
        d2 = d1.subtract(int256(d));

        return (d1, d2);
    }

    /**
     * @dev Square root
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
     * @dev Same as natural logarithm but hard-coded for known x values
     * @param x The value to be ln
     * @return ln of x
     */
    function _cachedLn(int256 x) internal pure returns (int256) {
        return LogarithmLib.ln(x);
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
