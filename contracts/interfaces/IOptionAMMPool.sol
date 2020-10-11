// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

interface IOptionAMMPool {
    function addLiquidity(uint256 amountOfStable, uint256 amountOfOptions) external;

    function removeLiquidity(uint256 amountOfStable, uint256 amountOfOptions) external;

    function buyExact(
        uint256 maxPayedStable,
        uint256 amount,
        uint256 sigmaInitialGuess
    ) external;

    function buyExactInput(
        uint256 amount,
        uint256 minOptionBought,
        uint256 sigmaInitialGuess
    ) external;
}
