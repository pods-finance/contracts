// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

// TODO: add other methods

interface IBlackScholes {
    function getPutPrice(
        int256 spotPrice,
        int256 strikePrice,
        int256 sigma,
        int256 daysRemaining,
        int256 riskFree
    ) external view returns (int256);
}
