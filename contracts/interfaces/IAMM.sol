// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface IAMM {
    function addLiquidity(
        uint256 amountOfA,
        uint256 amountOfB,
        address owner
    ) external;

    function removeLiquidity(uint256 amountOfA, uint256 amountOfB) external;
}
