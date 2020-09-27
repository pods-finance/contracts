// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";

contract Sigma {
    using SafeMath for uint256;

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

    function findNewSigma(
        uint256 targetPrice,
        uint256 sigmaInitialGuess,
        uint256 lastSigma,
        uint256 lastPrice,
        uint256 spotPrice,
        uint256 strikePrice
    ) public returns (uint256 newSigma) {
        uint256 calculatedInitialPrice = BS(sigmaInitialGuess, spotPrice, strikePrice);
        if (equalEnough(targetPrice, calculatedInitialPrice, 10)) {
            return sigmaInitialGuess;
        } else {
            uint256 sL;
            uint256 sH;
            uint256 pL;
            uint256 pH;
            uint256 p0 = targetPrice;

            // if selling - targetPrice < lastPrice
            sH = lastSigma;
            pH = lastPrice;

            // if buying - targetPrice > lastPrice
            sL = lastSigma;
            pL = lastPrice;

            // Need to fill the other side with 40% lower or higher

            if (calculatedInitialPrice > targetPrice && calculatedInitialPrice < lastPrice) {
                sH = sigmaInitialGuess;
                pH = calculatedInitialPrice;
            } else if (calculatedInitialPrice < targetPrice && calculatedInitialPrice > lastPrice) {
                sL = sigmaInitialGuess;
                pL = calculatedInitialPrice;
            }
            uint256 calculatedPrice = lastPrice;
            uint256 sN = lastSigma;
            while (equalEnough(targetPrice, calculatedPrice, 10) == false) {
                if (calculatedPrice > pL && calculatedPrice < targetPrice) {
                    pL = calculatedPrice;
                    sL = sN;
                } else {
                    pH = calculatedPrice;
                    sH = sN;
                }
                sN = findNextSigma(sL, sH, pL, pH, p0);
                calculatedPrice = BS(spotPrice, strikePrice, sN);
            }

            newSigma = sN;
            return newSigma;
        }
    }

    function BS(
        uint256,
        uint256,
        uint256
    ) public returns (uint256) {
        return 3;
    }
}
