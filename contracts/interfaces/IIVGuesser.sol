// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

interface IIVGuesser {
    function blackScholes() external view returns (address);

    function getPutIV(
        uint256 _targetPrice,
        uint256 _initialIVGuess,
        uint256 _spotPrice,
        uint256 _strikePrice,
        uint256 _timeToMaturity,
        int256 _riskFree
    ) external view returns (uint256, uint256);

    function getCallIV(
        uint256 _targetPrice,
        uint256 _initialIVGuess,
        uint256 _spotPrice,
        uint256 _strikePrice,
        uint256 _timeToMaturity,
        int256 _riskFree
    ) external view returns (uint256, uint256);

    function updateAcceptableRange() external;
}
