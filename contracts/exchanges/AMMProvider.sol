// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./ExchangeProvider.sol";
import "../interfaces/IOptionAMMFactory.sol";
import "../interfaces/IOptionAMMPool.sol";

contract AMMProvider is ExchangeProvider {
    using SafeMath for uint256;
    IOptionAMMFactory public factory;

    constructor(IOptionAMMFactory _factory) public {
        factory = _factory;
    }

    function swapWithExactInput(
        address inputToken,
        address outputToken,
        uint256 inputAmount,
        uint256 minOutputAmount,
        uint256 deadline,
        address recipient,
        bytes calldata params
    ) external override withinDeadline(deadline) returns (uint256 tokensBought) {
        uint256 inputBalanceBefore = ERC20(inputToken).balanceOf(address(this));
        uint256 outputBalanceBefore = ERC20(outputToken).balanceOf(address(this));
        IOptionAMMPool pool = _getPool(outputToken);

        // Take input amount from caller
        require(
            ERC20(inputToken).transferFrom(msg.sender, address(this), inputAmount),
            "Could not transfer tokens from caller"
        );

        // Approve exchange usage
        ERC20(inputToken).approve(address(pool), inputAmount);

        uint256 sigmaInitialGuess = _getSigmaInitialGuess(params);
        pool.tradeExactAInput(inputAmount, minOutputAmount, recipient, sigmaInitialGuess);

        uint256 inputBalanceAfter = ERC20(inputToken).balanceOf(address(this));
        ERC20(inputToken).transfer(recipient, inputBalanceAfter.sub(inputBalanceBefore));

        uint256 outputBalanceAfter = ERC20(outputToken).balanceOf(address(this));
        ERC20(outputToken).transfer(recipient, outputBalanceAfter.sub(outputBalanceBefore));

        tokensBought = outputBalanceBefore.sub(outputBalanceAfter);
        return tokensBought;
    }

    function swapWithExactOutput(
        address inputToken,
        address outputToken,
        uint256 maxInputAmount,
        uint256 outputAmount,
        uint256 deadline,
        address recipient,
        bytes calldata params
    ) external override withinDeadline(deadline) returns (uint256 tokensSold) {
        uint256 inputBalanceBefore = ERC20(inputToken).balanceOf(address(this));
        uint256 outputBalanceBefore = ERC20(outputToken).balanceOf(address(this));
        IOptionAMMPool pool = _getPool(outputToken);

        // Take input amount from caller
        require(
            ERC20(inputToken).transferFrom(msg.sender, address(this), maxInputAmount),
            "Could not transfer tokens from caller"
        );

        // Approve exchange usage
        ERC20(inputToken).approve(address(pool), maxInputAmount);

        uint256 sigmaInitialGuess = _getSigmaInitialGuess(params);
        pool.tradeExactAInput(maxInputAmount, outputAmount, recipient, sigmaInitialGuess);

        uint256 inputBalanceAfter = ERC20(inputToken).balanceOf(address(this));
        ERC20(inputToken).transfer(recipient, inputBalanceAfter.sub(inputBalanceBefore));

        uint256 outputBalanceAfter = ERC20(outputToken).balanceOf(address(this));
        ERC20(outputToken).transfer(recipient, outputBalanceAfter.sub(outputBalanceBefore));

        tokensSold = inputBalanceBefore.sub(inputBalanceAfter);
        return tokensSold;
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
        IOptionAMMPool pool = _getPool(tokenA);

        // Take tokenA amount from caller
        require(
            ERC20(tokenA).transferFrom(msg.sender, address(this), amountA),
            "Could not transfer options from caller"
        );

        // Take tokenB amount from caller
        require(
            ERC20(tokenB).transferFrom(msg.sender, address(this), amountB),
            "Could not transfer tokens from caller"
        );

        pool.addLiquidity(amountB, amountA, recipient);
    }

    /**
     * Returns the AMM Exchange associated with the option address
     *
     * @param optionAddress An address of token to be traded
     * @return IOptionAMMExchange
     */
    function _getPool(address optionAddress) internal view returns (IOptionAMMPool) {
        address exchangeOptionAddress = factory.getPool(optionAddress);
        require(exchangeOptionAddress != address(0), "Exchange not found");
        return IOptionAMMPool(exchangeOptionAddress);
    }

    /**
     * Extract the sigma from params sent
     *
     * @param params A byte array blob
     * @return Interpreted sigma
     */
    function _getSigmaInitialGuess(bytes calldata params) internal pure returns (uint256) {
        return abi.decode(params, (uint256));
    }
}
