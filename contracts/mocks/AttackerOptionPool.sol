// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "../interfaces/IOptionAMMPool.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract AttackerOptionPool {
    function addLiquidityAndBuy(
        address poolAddress,
        uint256 amountToAddA,
        uint256 amountToAddB,
        uint256 amountToBuyA,
        uint256 sigmaInitialGuess,
        address owner
    ) public {
        IOptionAMMPool pool = IOptionAMMPool(poolAddress);
        address tokenAAddress = pool.tokenA();
        address tokenBAddress = pool.tokenB();

        IERC20 tokenA = IERC20(tokenAAddress);
        IERC20 tokenB = IERC20(tokenBAddress);

        tokenA.transferFrom(msg.sender, address(this), amountToAddA);
        tokenA.approve(poolAddress, 2**255);

        tokenB.transferFrom(msg.sender, address(this), amountToAddB);
        tokenB.approve(poolAddress, 2**255);

        pool.addLiquidity(amountToAddA, amountToAddB, owner);
        pool.tradeExactAOutput(amountToBuyA, 2**255, owner, sigmaInitialGuess);
    }

    function addLiquidityAndRemove(
        address poolAddress,
        uint256 amountA,
        uint256 amountB,
        address owner
    ) public {
        IOptionAMMPool pool = IOptionAMMPool(poolAddress);
        address tokenAAddress = pool.tokenA();
        address tokenBAddress = pool.tokenB();

        IERC20 tokenA = IERC20(tokenAAddress);
        IERC20 tokenB = IERC20(tokenBAddress);

        tokenA.transferFrom(msg.sender, address(this), amountA);
        tokenA.approve(poolAddress, 2**255);

        tokenB.transferFrom(msg.sender, address(this), amountB);
        tokenB.approve(poolAddress, 2**255);

        pool.addLiquidity(amountA, amountB, address(this));
        pool.removeLiquidity(amountA, amountB);
    }
}
