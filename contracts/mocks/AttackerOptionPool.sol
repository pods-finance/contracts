pragma solidity 0.6.12;

import "../interfaces/IOptionAMMPool.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";

contract AttackerOptionPool {
    function addLiquidityAndBuy(
        address poolAddress,
        uint256 amountToAdd,
        uint256 amountToBuy,
        address owner
    ) public {
        IOptionAMMPool pool = IOptionAMMPool(poolAddress);
        address tokenAAddress = pool.tokenA();
        address tokenBAddress = pool.tokenB();

        IERC20 tokenA = IERC20(tokenAAddress);
        IERC20 tokenB = IERC20(tokenBAddress);

        tokenA.transferFrom(msg.sender, address(this), amountToBuy);
        tokenA.approve(poolAddress, 2**255);

        tokenB.transferFrom(msg.sender, address(this), amountToAdd);
        tokenB.approve(poolAddress, 2**255);

        pool.addLiquidity(amountToBuy, amountToAdd, owner);
        (, uint256 sigmaInitialGuess, , ) = pool.getOptionTradeDetailsExactAOutput(amountToBuy / 100);
        pool.tradeExactAOutput(amountToBuy / 100, 2**255, owner, sigmaInitialGuess);
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
