// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

interface IOptionAMMPool {
    function addLiquidity(
        uint256 amountOfStable,
        uint256 amountOfOptions,
        address recipient
    ) external;

    function removeLiquidity(uint256 amountOfStable, uint256 amountOfOptions) external;

    function buyExact(
        uint256 maxAmountIn,
        uint256 amountOut,
        uint256 sigmaInitialGuess
    ) external;

    function buyTokensWithExactTokens(
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 sigmaInitialGuess
    ) external;
}
