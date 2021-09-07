// SPDX-License-Identifier: agpl-3.0

// solhint-disable var-name-mixedcase
pragma solidity 0.8.4;

import "../interfaces/INormalDistribution.sol";
import "../interfaces/IBlackScholes.sol";

import "prb-math/contracts/PRBMathSD59x18.sol";
import "prb-math/contracts/PRBMathUD60x18.sol";

/**
 * @title BlackScholes
 * @author Pods Finance
 * @notice Black-Scholes calculus
 */
contract BlackScholes is IBlackScholes {
    using PRBMathSD59x18 for int256;
    using PRBMathUD60x18 for uint256;

    INormalDistribution public immutable normalDistribution;

    uint8 public constant decimals = 18; // solhint-disable-line const-name-snakecase

    constructor(address _normalDistribution) public {
        require(_normalDistribution != address(0), "BlackScholes: Invalid normalDistribution");
        normalDistribution = INormalDistribution(_normalDistribution);
    }

    /**
     * @notice Calculate call option price
     *
     * @param spotPrice Asset spot price
     * @param strikePrice Option strike price
     * @param iv Annually volatility on the asset price
     * @param time Annualized time until maturity
     * @param riskFree The risk-free rate
     * @return call option price
     */
    function getCallPrice(
        uint256 spotPrice,
        uint256 strikePrice,
        uint256 iv,
        uint256 time,
        int256 riskFree
    ) public override view returns (uint256) {
        (int256 d1, int256 d2) = _getZScores(
            _uintToInt(spotPrice),
            _uintToInt(strikePrice),
            _uintToInt(iv),
            _uintToInt(time),
            riskFree
        );

        uint256 Nd1 = normalDistribution.getProbability(d1, decimals);
        uint256 Nd2 = normalDistribution.getProbability(d2, decimals);

        uint256 get = spotPrice.mul(Nd1);
        uint256 pay = strikePrice.mul(Nd2);

        if (pay > get) {
            // Negative numbers not allowed
            return 0;
        }

        return get - pay;
    }

    /**
     * @notice Calculate put option price
     *
     * @param spotPrice Asset spot price
     * @param strikePrice Option strike price
     * @param iv Annually volatility on the asset price
     * @param time Annualized time until maturity
     * @param riskFree The risk-free rate
     * @return put option price
     */
    function getPutPrice(
        uint256 spotPrice,
        uint256 strikePrice,
        uint256 iv,
        uint256 time,
        int256 riskFree
    ) public override view returns (uint256) {
        (int256 d1, int256 d2) = _getZScores(
            _uintToInt(spotPrice),
            _uintToInt(strikePrice),
            _uintToInt(iv),
            _uintToInt(time),
            riskFree
        );

        uint256 Nd1 = normalDistribution.getProbability(_additiveInverse(d1), decimals);
        uint256 Nd2 = normalDistribution.getProbability(_additiveInverse(d2), decimals);

        uint256 get = strikePrice.mul(Nd2);
        uint256 pay = spotPrice.mul(Nd1);

        if (pay > get) {
            // Negative numbers not allowed
            return 0;
        }

        return get - pay;
    }

    /**
     * @dev Get z-scores d1 and d2
     *
     ***********************************************************************************************
     * So = spotPrice                                                                             //
     * X  = strikePrice                 ln( So / X ) + t ( r + ( σ² / 2 ) )                       //
     * σ  = implied volatility     d1 = --------------------------------------                    //
     * t  = time                                  σ ( sqrt(t) )                                   //
     * r  = riskFree                                                                              //
     *                             d2 = d1 - σ ( sqrt(t) )                                        //
     ***********************************************************************************************
     *
     * @param spotPrice Asset spot price
     * @param strikePrice Option strike price
     * @param iv Annually volatility on the asset price
     * @param time Annualized time until maturity
     * @param riskFree The risk-free rate
     */
    function _getZScores(
        int256 spotPrice,
        int256 strikePrice,
        int256 iv,
        int256 time,
        int256 riskFree
    ) internal pure returns (int256 d1, int256 d2) {
        int256 iv2 = iv.mul(iv);

        int256 A = spotPrice.div(strikePrice).ln();
        int256 B = (iv2.div(2e18) + riskFree).mul(time);

        int256 n = A + B;
        int256 d = iv.mul(time.sqrt());

        d1 = n.div(d);
        d2 = d1 - d;

        return (d1, d2);
    }

    /**
     * Convert uint256 to int256 taking in account overflow.
     */
    function _uintToInt(uint256 input) internal pure returns (int256) {
        int256 output = int256(input);
        require(output >= 0, "BlackScholes: casting overflow");
        return output;
    }

    /**
     * Return the additive inverse b of a number a
     */
    function _additiveInverse(int256 a) internal pure returns (int256 b) {
        b = -a;
        bool isAPositive = a > 0;
        bool isBPositive = b > 0;
        require(isBPositive != isAPositive, "BlackScholes: additiveInverse overflow");
    }
}
