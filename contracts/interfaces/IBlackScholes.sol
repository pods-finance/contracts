// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

// TODO: add other methods
interface IBlackScholes {
    function getPutPrice(
        int256 spotPrice,
        int256 strikePrice,
        uint256 sigma,
        uint256 daysRemaining,
        int256 riskFree
    ) external view returns (uint256);

    function getCallPrice(
        int256 spotPrice,
        int256 strikePrice,
        uint256 sigma,
        uint256 daysRemaining,
        int256 riskFree
    ) external view returns (uint256);
}
