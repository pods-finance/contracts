// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

// TODO: add call other methods
interface ISigma {
    function blackScholes() external returns (address);

    function getPutSigma(
        uint256 _targetPrice,
        uint256 _sigmaInitialGuess,
        uint256 _spotPrice,
        uint256 _strikePrice,
        uint256 _timeToMaturity,
        uint256 _riskFree
    ) external view returns (uint256, uint256);

    function getCallSigma(
        uint256 _targetPrice,
        uint256 _sigmaInitialGuess,
        uint256 _spotPrice,
        uint256 _strikePrice,
        uint256 _timeToMaturity,
        uint256 _riskFree
    ) external view returns (uint256, uint256);
}
