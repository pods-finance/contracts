// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface IBlackScholes {
    function getCallPrice(
        uint256 spotPrice,
        uint256 strikePrice,
        uint256 sigma,
        uint256 time,
        int256 riskFree
    ) external view returns (uint256);

    function getPutPrice(
        uint256 spotPrice,
        uint256 strikePrice,
        uint256 sigma,
        uint256 time,
        int256 riskFree
    ) external view returns (uint256);
}
