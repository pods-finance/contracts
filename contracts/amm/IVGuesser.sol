// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../interfaces/IBlackScholes.sol";
import "../interfaces/IPodOption.sol";
import "../interfaces/IIVGuesser.sol";
import "../interfaces/IConfigurationManager.sol";

contract IVGuesser is IIVGuesser {
    using SafeMath for uint256;
    IBlackScholes private immutable _blackScholes;

    /**
     * @dev store globally accessed configurations
     */
    IConfigurationManager public immutable configurationManager;

    /**
     * @dev numerical method's acceptable range
     */
    uint256 public acceptableRange;

    /**
     * @dev Min numerical method's acceptable range
     */
    uint256 public constant MIN_ACCEPTABLE_RANGE = 10; //10%

    struct Boundaries {
        uint256 ivLower;
        uint256 priceLower;
        uint256 ivHigher;
        uint256 priceHigher;
    }

    constructor(IConfigurationManager _configurationManager, address blackScholes) public {
        require(blackScholes != address(0), "IV: Invalid blackScholes");

        configurationManager = _configurationManager;

        acceptableRange = _configurationManager.getParameter("GUESSER_ACCEPTABLE_RANGE");

        require(acceptableRange >= MIN_ACCEPTABLE_RANGE, "IV: Invalid acceptableRange");

        _blackScholes = IBlackScholes(blackScholes);
    }

    function blackScholes() external override view returns (address) {
        return address(_blackScholes);
    }

    function getPutIV(
        uint256 _targetPrice,
        uint256 _initialIVGuess,
        uint256 _spotPrice,
        uint256 _strikePrice,
        uint256 _timeToMaturity,
        int256 _riskFree
    ) external override view returns (uint256 calculatedIV, uint256 calculatedPrice) {
        (calculatedIV, calculatedPrice) = getApproximatedIV(
            _targetPrice,
            _initialIVGuess,
            _spotPrice,
            _strikePrice,
            _timeToMaturity,
            _riskFree,
            IPodOption.OptionType.PUT
        );
        return (calculatedIV, calculatedPrice);
    }

    function getCallIV(
        uint256 _targetPrice,
        uint256 _initialIVGuess,
        uint256 _spotPrice,
        uint256 _strikePrice,
        uint256 _timeToMaturity,
        int256 _riskFree
    ) external override view returns (uint256 calculatedIV, uint256 calculatedPrice) {
        (calculatedIV, calculatedPrice) = getApproximatedIV(
            _targetPrice,
            _initialIVGuess,
            _spotPrice,
            _strikePrice,
            _timeToMaturity,
            _riskFree,
            IPodOption.OptionType.CALL
        );
        return (calculatedIV, calculatedPrice);
    }

    function getCloserIV(Boundaries memory boundaries, uint256 targetPrice) external pure returns (uint256) {
        return _getCloserIV(boundaries, targetPrice);
    }

    /**
     * Get an approximation of implied volatility given a target price inside an error range
     *
     * @param _targetPrice The target price that we need to find the implied volatility for
     * @param _initialIVGuess Implied Volatility guess in order to reduce gas costs
     * @param _spotPrice Current spot price of the underlying
     * @param _strikePrice Option strike price
     * @param _timeToMaturity Annualized time to maturity
     * @param _riskFree The risk-free rate
     * @param _optionType the option type (0 for PUt, 1 for Call)
     * @return calculatedIV The new implied volatility found given _targetPrice and inside ACCEPTABLE_ERROR
     * @return calculatedPrice That is the real price found, in the best scenario, calculated price should
     * be equal to _targetPrice
     */
    function getApproximatedIV(
        uint256 _targetPrice,
        uint256 _initialIVGuess,
        uint256 _spotPrice,
        uint256 _strikePrice,
        uint256 _timeToMaturity,
        int256 _riskFree,
        IPodOption.OptionType _optionType
    ) public view returns (uint256 calculatedIV, uint256 calculatedPrice) {
        require(_initialIVGuess > 0, "IV: initial guess should be greater than zero");
        uint256 calculatedInitialPrice = _getPrice(
            _spotPrice,
            _strikePrice,
            _initialIVGuess,
            _timeToMaturity,
            _riskFree,
            _optionType
        );
        if (_equalEnough(_targetPrice, calculatedInitialPrice, acceptableRange)) {
            return (_initialIVGuess, calculatedInitialPrice);
        } else {
            Boundaries memory boundaries = _getInitialBoundaries(
                _targetPrice,
                calculatedInitialPrice,
                _initialIVGuess,
                _spotPrice,
                _strikePrice,
                _timeToMaturity,
                _riskFree,
                _optionType
            );
            calculatedIV = _getCloserIV(boundaries, _targetPrice);
            calculatedPrice = _getPrice(
                _spotPrice,
                _strikePrice,
                calculatedIV,
                _timeToMaturity,
                _riskFree,
                _optionType
            );

            while (_equalEnough(_targetPrice, calculatedPrice, acceptableRange) == false) {
                if (calculatedPrice < _targetPrice) {
                    boundaries.priceLower = calculatedPrice;
                    boundaries.ivLower = calculatedIV;
                } else {
                    boundaries.priceHigher = calculatedPrice;
                    boundaries.ivHigher = calculatedIV;
                }
                calculatedIV = _getCloserIV(boundaries, _targetPrice);

                calculatedPrice = _getPrice(
                    _spotPrice,
                    _strikePrice,
                    calculatedIV,
                    _timeToMaturity,
                    _riskFree,
                    _optionType
                );
            }
            return (calculatedIV, calculatedPrice);
        }
    }

    /**********************************************************************************************
    // Each time you run this function, returns you a closer implied volatility value to          //
    // the target price p0 getCloserIV                                                            //
    // sL = IVLower                                                                               //
    // sH = IVHigher                                    ( sH - sL )                               //
    // pL = priceLower          sN = sL + ( p0 - pL ) * -----------                               //
    // pH = priceHigher                                 ( pH - pL )                               //
    // p0 = targetPrice                                                                           //
    // sN = IVNext                                                                                //
    **********************************************************************************************/
    function _getCloserIV(Boundaries memory boundaries, uint256 targetPrice) internal pure returns (uint256) {
        uint256 numerator = targetPrice.sub(boundaries.priceLower).mul(boundaries.ivHigher.sub(boundaries.ivLower));
        uint256 denominator = boundaries.priceHigher.sub(boundaries.priceLower);

        uint256 result = numerator.div(denominator);
        uint256 nextIV = boundaries.ivLower.add(result);
        return nextIV;
    }

    function _getPrice(
        uint256 _spotPrice,
        uint256 _strikePrice,
        uint256 calculatedIV,
        uint256 _timeToMaturity,
        int256 _riskFree,
        IPodOption.OptionType _optionType
    ) internal view returns (uint256 price) {
        if (_optionType == IPodOption.OptionType.PUT) {
            price = _blackScholes.getPutPrice(_spotPrice, _strikePrice, calculatedIV, _timeToMaturity, _riskFree);
        } else {
            price = _blackScholes.getCallPrice(_spotPrice, _strikePrice, calculatedIV, _timeToMaturity, _riskFree);
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
        uint256 initialIV,
        uint256 _spotPrice,
        uint256 _strikePrice,
        uint256 _timeToMaturity,
        int256 _riskFree,
        IPodOption.OptionType _optionType
    ) internal view returns (Boundaries memory b) {
        b.ivLower = 0;
        b.priceLower = 0;
        uint256 newGuessPrice = initialPrice;
        uint256 newGuessIV = initialIV;

        // nextGuessIV = nextTryPrice
        while (newGuessPrice < _targetPrice) {
            b.ivLower = newGuessIV;
            b.priceLower = newGuessPrice;

            // it keep increasing the currentIV in 150% until it finds a new higher boundary
            newGuessIV = newGuessIV.add(newGuessIV.div(2));
            newGuessPrice = _getPrice(_spotPrice, _strikePrice, newGuessIV, _timeToMaturity, _riskFree, _optionType);
        }
        b.ivHigher = newGuessIV;
        b.priceHigher = newGuessPrice;
    }

    /**
     * @notice Update acceptableRange calling configuratorManager
     */
    function updateAcceptableRange() external override {
        acceptableRange = configurationManager.getParameter("GUESSER_ACCEPTABLE_RANGE");
        require(acceptableRange >= MIN_ACCEPTABLE_RANGE, "IV: Invalid acceptableRange");
    }
}
