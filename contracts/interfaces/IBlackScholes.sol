// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface IBlackScholes {
    function getCallPrice(
        int256 spotPrice,
        int256 strikePrice,
        uint256 sigma,
        uint256 time,
        int256 riskFree
    ) external view returns (uint256);

    function getPutPrice(
        int256 spotPrice,
        int256 strikePrice,
        uint256 sigma,
        uint256 time,
        int256 riskFree
    ) external view returns (uint256);
}
