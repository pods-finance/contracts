// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "./ExchangeProvider.sol";
import "../interfaces/IUniswapV1.sol";

contract UniswapV1Provider is ExchangeProvider {
    IUniswapFactory public uniswapFactory;

    function initialize(IUniswapFactory _uniswapFactory) external initializer {
        uniswapFactory = _uniswapFactory;
    }

    function swapWithExactInput(
        address inputToken,
        address outputToken,
        uint256 inputAmount,
        uint256 minOutputAmount,
        uint256 deadline,
        address recipient
    ) external override withinDeadline(deadline) returns (uint256 outputBought) {
        IUniswapExchange exchange = _getExchange(inputToken);

        uint256 minEthBought = 1;

        try
            exchange.tokenToTokenTransferInput(
                inputAmount,
                minOutputAmount,
                minEthBought,
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

    function swapWithExactOutput(
        address inputToken,
        address outputToken,
        uint256 maxOutputAmount,
        uint256 outputAmount,
        uint256 deadline,
        address recipient
    ) external override withinDeadline(deadline) returns (uint256 inputSold) {
        IUniswapExchange exchange = _getExchange(inputToken);

        uint256 maxEthBought = uint256(-1);

        try
            exchange.tokenToTokenTransferOutput(
                outputAmount,
                maxOutputAmount,
                maxEthBought,
                deadline,
                recipient,
                outputToken
            )
        returns (uint256 tokensSold) {
            return tokensSold;
        } catch {
            revert("Uniswap trade failed");
        }
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
}
