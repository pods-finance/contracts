// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./ExchangeProvider.sol";
import "../interfaces/BPool.sol";

contract BalancerProvider is ExchangeProvider {
    using SafeMath for uint256;
    BPool public balancerPool;

    uint256 public constant MAX_PRICE = uint256(-1);

    function initialize(BPool _balancerPool) external initializer {
        balancerPool = _balancerPool;
    }

    function swapWithExactInput(
        address inputToken,
        address outputToken,
        uint256 inputAmount,
        uint256 minOutputAmount,
        uint256 deadline,
        address recipient
    ) external override withinDeadline(deadline) returns (uint256) {
        uint256 inputBalanceBefore = ERC20(inputToken).balanceOf(address(this));
        uint256 outputBalanceBefore = ERC20(outputToken).balanceOf(address(this));

        // Take input amount from caller
        require(
            ERC20(inputToken).transferFrom(msg.sender, address(this), inputAmount),
            "Could not transfer tokens from caller"
        );

        // Approve exchange usage
        ERC20(inputToken).approve(address(balancerPool), inputAmount);

        (uint256 outputBought, ) = balancerPool.swapExactAmountIn(
            inputToken,
            inputAmount,
            outputToken,
            minOutputAmount,
            MAX_PRICE
        );

        uint256 inputBalanceAfter = ERC20(inputToken).balanceOf(address(this));
        ERC20(inputToken).transfer(recipient, inputBalanceAfter.sub(inputBalanceBefore));

        uint256 outputBalanceAfter = ERC20(outputToken).balanceOf(address(this));
        ERC20(outputToken).transfer(recipient, outputBalanceAfter.sub(outputBalanceBefore));

        return outputBought;
    }

    function swapWithExactOutput(
        address inputToken,
        address outputToken,
        uint256 maxInputAmount,
        uint256 outputAmount,
        uint256 deadline,
        address recipient
    ) external override withinDeadline(deadline) returns (uint256) {
        uint256 inputBalanceBefore = ERC20(inputToken).balanceOf(address(this));
        uint256 outputBalanceBefore = ERC20(outputToken).balanceOf(address(this));

        // Take input amount from caller
        require(
            ERC20(inputToken).transferFrom(msg.sender, address(this), maxInputAmount),
            "Could not transfer tokens from caller"
        );

        // Approve exchange usage
        ERC20(inputToken).approve(address(balancerPool), maxInputAmount);

        (uint256 inputSold, ) = balancerPool.swapExactAmountOut(
            inputToken,
            maxInputAmount,
            outputToken,
            outputAmount,
            MAX_PRICE
        );

        uint256 inputBalanceAfter = ERC20(inputToken).balanceOf(address(this));
        ERC20(inputToken).transfer(recipient, inputBalanceAfter.sub(inputBalanceBefore));

        uint256 outputBalanceAfter = ERC20(outputToken).balanceOf(address(this));
        ERC20(outputToken).transfer(recipient, outputBalanceAfter.sub(outputBalanceBefore));

        return inputSold;
    }
}
