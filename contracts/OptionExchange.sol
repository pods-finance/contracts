// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IPodPut.sol";
import "./exchanges/ExchangeProvider.sol";

/**
 * Represents a Proxy that can mint and sell on the behalf of a Option Seller,
 * alternatively it can buy to a Option Buyer
 */
contract OptionExchange {
    ExchangeProvider public exchange;

    event OptionsBought(
        address indexed buyer,
        address indexed optionAddress,
        uint256 optionsBought,
        address inputToken,
        uint256 inputSold
    );

    event OptionsSold(
        address indexed seller,
        address indexed optionAddress,
        uint256 optionsSold,
        address outputToken,
        uint256 outputBought
    );

    constructor (ExchangeProvider _exchange) public {
        exchange = _exchange;
    }

    /**
     * Mints an amount of options and sell it in liquidity provider
     * @notice Mint and sell options
     *
     * @param option The option contract to mint
     * @param optionAmount Amount of options to mint
     * @param outputToken The token which the premium will be paid
     * @param minOutputAmount Minimum amount of output tokens accepted
     * @param deadline The deadline in unix-timestamp that limits the transaction from happening
     */
    function sellOptions(
        IPodPut option,
        uint256 optionAmount,
        address outputToken,
        uint256 minOutputAmount,
        uint256 deadline
    ) external {
        uint256 strikeToTransfer = option.strikeToTransfer(optionAmount);

        IERC20 strikeAsset = IERC20(option.strikeAsset());
        require(
            strikeAsset.transferFrom(msg.sender, address(this), strikeToTransfer),
            "Could not transfer strike tokens from caller"
        );

        address optionAddress = address(option);

        // Approving Strike transfer to Option
        strikeAsset.approve(optionAddress, strikeToTransfer);
        option.mint(optionAmount, msg.sender);

        // Approving Option transfer to Exchange
        option.approve(address(exchange), optionAmount);

        uint256 outputBought = exchange.swapWithExactInput(
            optionAddress,
            outputToken,
            optionAmount,
            minOutputAmount,
            deadline,
            msg.sender
        );

        emit OptionsSold(msg.sender, optionAddress, optionAmount, outputToken, outputBought);
    }

    /**
     * Buys an amount of options from liquidity provider
     * @notice Buy exact amount of options
     *
     * @param option The option contract to buy
     * @param optionAmount Amount of options to buy
     * @param inputToken The token spent to buy options
     * @param maxInputAmount Max amount of input tokens sold
     * @param deadline The deadline in unix-timestamp that limits the transaction from happening
     */
    function buyExactOptions(
        IPodPut option,
        uint256 optionAmount,
        address inputToken,
        uint256 maxInputAmount,
        uint256 deadline
    ) external {
        address optionAddress = address(option);

        uint256 inputSold = exchange.swapWithExactOutput(
            inputToken,
            optionAddress,
            maxInputAmount,
            optionAmount,
            deadline,
            msg.sender
        );

        emit OptionsBought(msg.sender, optionAddress, optionAmount, inputToken, inputSold);
    }

    /**
     * Buys an estimated amount of options from liquidity provider
     * @notice Buy estimated amount of options
     *
     * @param option The option contract to buy
     * @param minOptionAmount Min amount of options bought
     * @param inputToken The token spent to buy options
     * @param inputAmount The exact amount of input tokens sold
     * @param deadline The deadline in unix-timestamp that limits the transaction from happening
     */
    function buyOptionsWithExactTokens(
        IPodPut option,
        uint256 minOptionAmount,
        address inputToken,
        uint256 inputAmount,
        uint256 deadline
    ) external {
        address optionAddress = address(option);

        uint256 outputBought = exchange.swapWithExactInput(
            inputToken,
            optionAddress,
            inputAmount,
            minOptionAmount,
            deadline,
            msg.sender
        );

        emit OptionsBought(msg.sender, optionAddress, outputBought, inputToken, inputAmount);
    }
}
