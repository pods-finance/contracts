// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./ExchangeProvider.sol";
import "../interfaces/BPool.sol";

contract BalancerProvider is ExchangeProvider {
    using SafeMath for uint256;
    BPool public balancerPool;

    uint256 public constant MAX_PRICE = uint256(-1);

    constructor(BPool _balancerPool) public {
        balancerPool = _balancerPool;
    }

    function swapWithExactInput(
        address inputToken,
        address outputToken,
        uint256 inputAmount,
        uint256 minOutputAmount,
        uint256 deadline,
        address recipient,
        bytes calldata params // solhint-disable-line no-unused-vars
    ) external override withinDeadline(deadline) returns (uint256) {
        uint256 inputBalanceBefore = IERC20(inputToken).balanceOf(address(this));
        uint256 outputBalanceBefore = IERC20(outputToken).balanceOf(address(this));

        // Take input amount from caller
        require(
            IERC20(inputToken).transferFrom(msg.sender, address(this), inputAmount),
            "Could not transfer tokens from caller"
        );

        // Approve exchange usage
        IERC20(inputToken).approve(address(balancerPool), inputAmount);

        (uint256 outputBought, ) = balancerPool.swapExactAmountIn(
            inputToken,
            inputAmount,
            outputToken,
            minOutputAmount,
            MAX_PRICE
        );

        uint256 inputBalanceAfter = IERC20(inputToken).balanceOf(address(this));
        IERC20(inputToken).transfer(recipient, inputBalanceAfter.sub(inputBalanceBefore));

        uint256 outputBalanceAfter = IERC20(outputToken).balanceOf(address(this));
        IERC20(outputToken).transfer(recipient, outputBalanceAfter.sub(outputBalanceBefore));

        return outputBought;
    }

    function swapWithExactOutput(
        address inputToken,
        address outputToken,
        uint256 maxInputAmount,
        uint256 outputAmount,
        uint256 deadline,
        address recipient,
        bytes calldata params // solhint-disable-line no-unused-vars
    ) external override withinDeadline(deadline) returns (uint256) {
        uint256 inputBalanceBefore = IERC20(inputToken).balanceOf(address(this));
        uint256 outputBalanceBefore = IERC20(outputToken).balanceOf(address(this));

        // Take input amount from caller
        require(
            IERC20(inputToken).transferFrom(msg.sender, address(this), maxInputAmount),
            "Could not transfer tokens from caller"
        );

        // Approve exchange usage
        IERC20(inputToken).approve(address(balancerPool), maxInputAmount);

        (uint256 inputSold, ) = balancerPool.swapExactAmountOut(
            inputToken,
            maxInputAmount,
            outputToken,
            outputAmount,
            MAX_PRICE
        );

        uint256 inputBalanceAfter = IERC20(inputToken).balanceOf(address(this));
        IERC20(inputToken).transfer(recipient, inputBalanceAfter.sub(inputBalanceBefore));

        uint256 outputBalanceAfter = IERC20(outputToken).balanceOf(address(this));
        IERC20(outputToken).transfer(recipient, outputBalanceAfter.sub(outputBalanceBefore));

        return inputSold;
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 deadline,
        address recipient,
        bytes calldata params
    ) external override withinDeadline(deadline) {
        // TODO
    }
}
