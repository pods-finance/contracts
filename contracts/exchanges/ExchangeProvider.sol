// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;

abstract contract ExchangeProvider {
    modifier withinDeadline(uint256 deadline) {
        require(deadline > block.timestamp, "Transaction timeout");
        _;
    }

    function swapWithExactInput(
        address inputToken,
        address outputToken,
        uint256 inputAmount,
        uint256 minOutputAmount,
        uint256 deadline,
        address recipient,
        bytes calldata params
    ) external virtual returns (uint256 outputBought);

    function swapWithExactOutput(
        address inputToken,
        address outputToken,
        uint256 maxInputAmount,
        uint256 outputAmount,
        uint256 deadline,
        address recipient,
        bytes calldata params
    ) external virtual returns (uint256 inputSold);

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 deadline,
        address recipient,
        bytes calldata params
    ) external virtual;
}
