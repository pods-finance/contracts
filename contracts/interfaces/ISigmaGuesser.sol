// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

interface ISigmaGuesser {
    function blackScholes() external view returns (address);

    function getPutSigma(
        uint256 _targetPrice,
        uint256 _sigmaInitialGuess,
        uint256 _spotPrice,
        uint256 _strikePrice,
        uint256 _timeToMaturity,
        int256 _riskFree
    ) external view returns (uint256, uint256);

    function getCallSigma(
        uint256 _targetPrice,
        uint256 _sigmaInitialGuess,
        uint256 _spotPrice,
        uint256 _strikePrice,
        uint256 _timeToMaturity,
        int256 _riskFree
    ) external view returns (uint256, uint256);
}
