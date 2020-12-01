// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../interfaces/IBlackScholes.sol";

contract Sigma {
    using SafeMath for uint256;
    IBlackScholes public blackScholes;
    enum OptionType { PUT, CALL }
    uint256 constant ACCEPTABLE_ERROR = 10; // < 3%

    struct Boundaries {
        uint256 sigmaLower; // [wad]
        uint256 priceLower; // [wad]
        uint256 sigmaHigher; // [wad]
        uint256 priceHigher; // [wad]
    }

    constructor(address _blackScholes) public {
        blackScholes = IBlackScholes(_blackScholes);
    }

    function getPutSigma(
        uint256 _targetPrice,
        uint256 _sigmaInitialGuess,
        uint256 _spotPrice,
        uint256 _strikePrice,
        uint256 _timeToMaturity,
        uint256 _riskFree
    ) external view returns (uint256 calculatedSigma, uint256 calculatedPrice) {
        (calculatedSigma, calculatedPrice) = getSigma(
            _targetPrice,
            _sigmaInitialGuess,
            _spotPrice,
            _strikePrice,
            _timeToMaturity,
            _riskFree,
            OptionType.PUT
        );
        return (calculatedSigma, calculatedPrice);
    }

    function getCallSigma(
        uint256 _targetPrice,
        uint256 _sigmaInitialGuess,
        uint256 _spotPrice,
        uint256 _strikePrice,
        uint256 _timeToMaturity,
        uint256 _riskFree
    ) external view returns (uint256 calculatedSigma, uint256 calculatedPrice) {
        (calculatedSigma, calculatedPrice) = getSigma(
            _targetPrice,
            _sigmaInitialGuess,
            _spotPrice,
            _strikePrice,
            _timeToMaturity,
            _riskFree,
            OptionType.CALL
        );
        return (calculatedSigma, calculatedPrice);
    }

    /**
     * Get an approximation of sigma given a target price inside an error range
     *
     * @param _targetPrice The target price that we need to find the sigma for
     * @param _sigmaInitialGuess sigma guess in order to reduce gas costs
     * @param _spotPrice Current spot price of the underlying
     * @param _strikePrice Option strike price
     * @param _timeToMaturity Annualized time to maturity
     * @param _riskFree The risk-free rate
     * @param _optionType the option type (0 for PUt, 1 for Call)
     * @return calculatedSigma The new sigma found given _targetPrice and inside ACCEPTABLE_ERROR
     * @return calculatedPrice That is the real price found, in the best scenario, calculated price should be equal to _targetPrice
     */
    function getSigma(
        uint256 _targetPrice,
        uint256 _sigmaInitialGuess,
        uint256 _spotPrice,
        uint256 _strikePrice,
        uint256 _timeToMaturity,
        uint256 _riskFree,
        OptionType _optionType
    ) public view returns (uint256 calculatedSigma, uint256 calculatedPrice) {
        require(_sigmaInitialGuess > 0, "Sigma cant be null");
        uint256 calculatedInitialPrice = _getPrice(
            _spotPrice,
            _strikePrice,
            _sigmaInitialGuess,
            _timeToMaturity,
            _riskFree,
            _optionType
        );
        if (_equalEnough(_targetPrice, calculatedInitialPrice, ACCEPTABLE_ERROR)) {
            return (_sigmaInitialGuess, calculatedInitialPrice);
        } else {
            Boundaries memory boundaries = _getInitialBoundaries(
                _targetPrice,
                calculatedInitialPrice,
                _sigmaInitialGuess,
                _spotPrice,
                _strikePrice,
                _timeToMaturity,
                _riskFree,
                _optionType
            );
            calculatedSigma = _getCloserSigma(boundaries, _targetPrice);

            calculatedPrice = _getPrice(
                _spotPrice,
                _strikePrice,
                calculatedSigma,
                _timeToMaturity,
                _riskFree,
                _optionType
            );

            while (_equalEnough(_targetPrice, calculatedPrice, ACCEPTABLE_ERROR) == false) {
                if (calculatedPrice < _targetPrice) {
                    boundaries.priceLower = calculatedPrice;
                    boundaries.sigmaLower = calculatedSigma;
                } else {
                    boundaries.priceHigher = calculatedPrice;
                    boundaries.sigmaHigher = calculatedSigma;
                }
                calculatedSigma = _getCloserSigma(boundaries, _targetPrice);

                calculatedPrice = _getPrice(
                    _spotPrice,
                    _strikePrice,
                    calculatedSigma,
                    _timeToMaturity,
                    _riskFree,
                    _optionType
                );
            }
            return (calculatedSigma, calculatedPrice);
        }
    }

    function getCloserSigma(Boundaries memory boundaries, uint256 targetPrice) external pure returns (uint256) {
        return _getCloserSigma(boundaries, targetPrice);
    }

    /**********************************************************************************************
    // Each time you run this function, returns you a closer sigma value to the target price p0   //
    // getCloserSigma                                                                             //
    // sL = sigmaLower                                                                            //
    // sH = sigmaHigher                                 ( sH - sL )                               //
    // pL = priceLower          sN = sL + ( p0 - pL ) * -----------                               //
    // pH = priceHigher                                 ( pH - pL )                               //
    // p0 = targetPrice                                                                           //
    // sN = sigmaNext                                                                             //
    **********************************************************************************************/
    function _getCloserSigma(Boundaries memory boundaries, uint256 targetPrice) internal pure returns (uint256) {
        uint256 numerator = targetPrice.sub(boundaries.priceLower).mul(
            boundaries.sigmaHigher.sub(boundaries.sigmaLower)
        );
        uint256 denominator = boundaries.priceHigher.sub(boundaries.priceLower);

        uint256 result = numerator.div(denominator);
        uint256 nextSigma = boundaries.sigmaLower.add(result);
        return nextSigma;
    }

    function _getPrice(
        uint256 _spotPrice,
        uint256 _strikePrice,
        uint256 calculatedSigma,
        uint256 _timeToMaturity,
        uint256 _riskFree,
        OptionType _optionType
    ) internal view returns (uint256 price) {
        if (_optionType == OptionType.PUT) {
            price = blackScholes.getPutPrice(
                int256(_spotPrice),
                int256(_strikePrice),
                calculatedSigma,
                _timeToMaturity,
                int256(_riskFree)
            );
        } else {
            price = blackScholes.getCallPrice(
                int256(_spotPrice),
                int256(_strikePrice),
                calculatedSigma,
                _timeToMaturity,
                int256(_riskFree)
            );
        }
        return price;
    }

    function _equalEnough(
        uint256 target,
        uint256 value,
        uint256 range
    ) internal pure returns (bool) {
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
        uint256 _riskFree,
        OptionType _optionType
    ) internal view returns (Boundaries memory b) {
        b.sigmaLower = 0;
        b.priceLower = 0;
        uint256 newGuessPrice = initialPrice;
        uint256 newGuessSigma = initialSigma;

        while (newGuessPrice < _targetPrice) {
            b.sigmaLower = newGuessSigma;
            b.priceLower = newGuessPrice;

            newGuessSigma = newGuessSigma.add(newGuessSigma.div(2));
            newGuessPrice = _getPrice(_spotPrice, _strikePrice, newGuessSigma, _timeToMaturity, _riskFree, _optionType);
        }
        b.sigmaHigher = newGuessSigma;
        b.priceHigher = newGuessPrice;
    }
}
