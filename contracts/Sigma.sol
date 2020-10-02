// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./interfaces/IBlackScholes.sol";

contract Sigma {
    using SafeMath for uint256;
    IBlackScholes public blackScholes;
    uint256 constant ACCEPTABLE_ERROR = 14; // < 5%

    struct Boundaries {
        uint256 sigmaLower; // [wad]
        uint256 priceLower; // [wad]
        uint256 sigmaHigher; // [wad]
        uint256 priceHigher; // [wad]
    }

    constructor(address _blackScholes) public {
        blackScholes = IBlackScholes(_blackScholes);
    }

    /**
     * Find the a aproximation of sigma given an target price
     *
     * @param _targetPrice The target price that we need to find the sigma for
     * @param _sigmaInitialGuess sigma guess in order to reduce gas costs
     * @param _spotPrice Current spot price
     * @param _strikePrice Option strike price
     * @param _timeToMaturity Annualized time to maturity
     * @param _riskFree The risk-free rate
     * @return newSigma
     */
    function findNewSigmaPut(
        uint256 _targetPrice,
        uint256 _sigmaInitialGuess,
        uint256 _spotPrice,
        uint256 _strikePrice,
        uint256 _timeToMaturity,
        uint256 _riskFree
    ) public view returns (uint256, uint256) {
        require(_sigmaInitialGuess > 0, "Sigma cant be null");
        uint256 calculatedInitialPrice = blackScholes.getPutPrice(
            int256(_spotPrice),
            int256(_strikePrice),
            _sigmaInitialGuess,
            _timeToMaturity,
            int256(_riskFree)
        );
        if (equalEnough(_targetPrice, calculatedInitialPrice, ACCEPTABLE_ERROR)) {
            return (_sigmaInitialGuess, calculatedInitialPrice);
        } else {
            Boundaries memory boundaries = _getInitialBoundaries(
                _targetPrice,
                calculatedInitialPrice,
                _sigmaInitialGuess,
                _spotPrice,
                _strikePrice,
                _timeToMaturity,
                _riskFree
            );
            uint256 p0 = _targetPrice;
            uint256 sN = findNextSigma(
                boundaries.sigmaLower,
                boundaries.sigmaHigher,
                boundaries.priceLower,
                boundaries.priceHigher,
                p0
            );

            uint256 calculatedPrice = uint256(
                blackScholes.getPutPrice(
                    int256(_spotPrice),
                    int256(_strikePrice),
                    sN,
                    _timeToMaturity,
                    int256(_timeToMaturity)
                )
            );

            while (equalEnough(_targetPrice, calculatedPrice, ACCEPTABLE_ERROR) == false) {
                if (calculatedPrice < _targetPrice) {
                    boundaries.priceLower = calculatedPrice;
                    boundaries.sigmaLower = sN;
                } else {
                    boundaries.priceHigher = calculatedPrice;
                    boundaries.sigmaHigher = sN;
                }
                sN = findNextSigma(
                    boundaries.sigmaLower,
                    boundaries.sigmaHigher,
                    boundaries.priceLower,
                    boundaries.priceHigher,
                    p0
                );

                calculatedPrice = uint256(
                    blackScholes.getPutPrice(
                        int256(_spotPrice),
                        int256(_strikePrice),
                        sN,
                        _timeToMaturity,
                        int256(_timeToMaturity)
                    )
                );
            }
            return (sN, calculatedPrice);
        }
    }

    /**********************************************************************************************
    // findNextSigma                                                                              //
    // sL = sigmaLower                                                                            //
    // sH = sigmaHigher                                 ( sH - sL )                               //
    // pL = priceLower          sN = sL + ( p0 - pL ) * ------------                              //
    // pH = priceHigher                                 ( pH - pL )                               //
    // p0 = targetPrice                                                                           //
    // sN = sigmaNext                                                                             //
    **********************************************************************************************/
    function findNextSigma(
        uint256 sigmaLower,
        uint256 sigmaHigher,
        uint256 priceLower,
        uint256 priceHigher,
        uint256 targetPrice
    ) public pure returns (uint256) {
        uint256 numerator = targetPrice.sub(priceLower).mul(sigmaHigher.sub(sigmaLower));
        uint256 denominator = priceHigher.sub(priceLower);

        uint256 result = numerator.div(denominator);
        uint256 nextSigma = sigmaLower.add(result);
        return nextSigma;
    }

    function equalEnough(
        uint256 target,
        uint256 value,
        uint256 range
    ) public pure returns (bool) {
        uint256 proportion = target / range;
        if (target > value) {
            uint256 diff = target - value;
            return diff <= proportion;
        } else {
            uint256 diff = value - target;
            return diff <= proportion;
        }
    }

    function _getInitialBoundaries(
        uint256 _targetPrice,
        uint256 initialPrice,
        uint256 initialSigma,
        uint256 _spotPrice,
        uint256 _strikePrice,
        uint256 _timeToMaturity,
        uint256 _riskFree
    ) internal view returns (Boundaries memory b) {
        b.sigmaLower = 0;
        b.priceLower = 0;
        uint256 newGuessPrice = initialPrice;
        uint256 newGuessSigma = initialSigma;

        while (newGuessPrice < _targetPrice) {
            b.sigmaLower = newGuessSigma;
            b.priceLower = newGuessPrice;

            newGuessSigma = newGuessSigma.add(newGuessSigma.div(2));
            newGuessPrice = blackScholes.getPutPrice(
                int256(_spotPrice),
                int256(_strikePrice),
                newGuessSigma,
                _timeToMaturity,
                int256(_riskFree)
            );
        }
        b.sigmaHigher = newGuessSigma;
        b.priceHigher = newGuessPrice;
    }
}
