// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

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
        address recipient
    ) external virtual returns (uint256 outputBought);

    function swapWithExactOutput(
        address inputToken,
        address outputToken,
        uint256 maxInputAmount,
        uint256 outputAmount,
        uint256 deadline,
        address recipient
    ) external virtual returns (uint256 inputSold);
}
