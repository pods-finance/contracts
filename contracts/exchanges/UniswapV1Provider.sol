// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./ExchangeProvider.sol";
import "../interfaces/IUniswapV1.sol";

contract UniswapV1Provider is ExchangeProvider {
    using SafeMath for uint256;
    IUniswapFactory public uniswapFactory;

    uint256 public constant MIN_ETH_BOUGHT = 1;
    uint256 public constant MAX_ETH_SOLD = uint256(-1);

    constructor(IUniswapFactory _uniswapFactory) public {
        uniswapFactory = _uniswapFactory;
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
        return _swapWithExactInput(inputToken, outputToken, inputAmount, minOutputAmount, deadline, recipient);
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
        return _swapWithExactOutput(inputToken, outputToken, maxInputAmount, outputAmount, deadline, recipient);
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

    /**
     * Returns the Uniswap Exchange associated with the token address
     *
     * @param tokenAddress An address of token to be traded
     * @return IUniswapExchange
     */
    function _getExchange(address tokenAddress) internal view returns (IUniswapExchange) {
        address exchangeOptionAddress = uniswapFactory.getExchange(tokenAddress);
        require(exchangeOptionAddress != address(0), "Exchange not found");
        return IUniswapExchange(exchangeOptionAddress);
    }

    function _swapWithExactInput(
        address inputToken,
        address outputToken,
        uint256 inputAmount,
        uint256 minOutputAmount,
        uint256 deadline,
        address recipient
    ) internal returns (uint256) {
        IUniswapExchange exchange = _getExchange(inputToken);

        // Take input amount from caller
        require(
            IERC20(inputToken).transferFrom(msg.sender, address(this), inputAmount),
            "Could not transfer tokens from caller"
        );

        // Approve exchange usage
        IERC20(inputToken).approve(address(exchange), inputAmount);

        try
            exchange.tokenToTokenTransferInput(
                inputAmount,
                minOutputAmount,
                MIN_ETH_BOUGHT,
                deadline,
                recipient,
                outputToken
            )
        returns (uint256 tokensBought) {
            return tokensBought;
        } catch {
            revert("Uniswap trade failed");
        }
    }

    function _swapWithExactOutput(
        address inputToken,
        address outputToken,
        uint256 maxInputAmount,
        uint256 outputAmount,
        uint256 deadline,
        address recipient
    ) internal returns (uint256) {
        IUniswapExchange exchange = _getExchange(inputToken);

        uint256 balanceBefore = IERC20(inputToken).balanceOf(address(this));

        // Take input amount from caller
        require(
            IERC20(inputToken).transferFrom(msg.sender, address(this), maxInputAmount),
            "Could not transfer tokens from caller"
        );

        // Approve exchange usage
        IERC20(inputToken).approve(address(exchange), maxInputAmount);

        try
            exchange.tokenToTokenTransferOutput(
                outputAmount,
                maxInputAmount,
                MAX_ETH_SOLD,
                deadline,
                recipient,
                outputToken
            )
        returns (uint256 tokensSold) {
            uint256 balanceAfter = IERC20(inputToken).balanceOf(address(this));
            IERC20(inputToken).transfer(recipient, balanceAfter.sub(balanceBefore));
            return tokensSold;
        } catch {
            revert("Uniswap trade failed");
        }
    }
}
