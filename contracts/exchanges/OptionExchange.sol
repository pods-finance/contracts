// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IPodPut.sol";
import "./ExchangeProvider.sol";

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

    event OptionsStaked(
        address indexed staker,
        address indexed optionAddress,
        uint256 amountOptions,
        address token,
        uint256 amountToken
    );

    constructor(ExchangeProvider _exchange) public {
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
     * @param params Custom params sent to exchange
     */
    function sellOptions(
        IPodPut option,
        uint256 optionAmount,
        address outputToken,
        uint256 minOutputAmount,
        uint256 deadline,
        bytes calldata params
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
            msg.sender,
            params
        );

        emit OptionsSold(msg.sender, optionAddress, optionAmount, outputToken, outputBought);
    }

    /**
     * Mints an amount of options and return to caller
     * @notice Mint options
     *
     * @param option The option contract to mint
     * @param optionAmount Amount of options to mint
     */
    function mintOptions(IPodPut option, uint256 optionAmount) external {
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

        require(option.transfer(msg.sender, optionAmount), "Could not transfer back options to caller");
    }

    /**
     * Mint options and add them as liquidity providing
     *
     * @param option The option contract to mint
     * @param optionAmount Amount of options to mint
     * @param token The output token which the premium will be paid
     * @param amountToken Amount of output tokens accepted
     * @param deadline The deadline in unix-timestamp that limits the transaction from happening
     * @param params Custom params sent to exchange
     */
    function addLiquidity(
        IPodPut option,
        uint256 optionAmount,
        address token,
        uint256 amountToken,
        uint256 deadline,
        bytes calldata params
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

        exchange.addLiquidity(optionAddress, token, optionAmount, amountToken, deadline, msg.sender, params);

        emit OptionsStaked(msg.sender, optionAddress, optionAmount, token, amountToken);
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
     * @param params Custom params sent to exchange
     */
    function buyExactOptions(
        IPodPut option,
        uint256 optionAmount,
        address inputToken,
        uint256 maxInputAmount,
        uint256 deadline,
        bytes calldata params
    ) external {
        address optionAddress = address(option);

        // Take input amount from caller
        require(
            IERC20(inputToken).transferFrom(msg.sender, address(this), maxInputAmount),
            "Could not transfer tokens from caller"
        );

        // Approve exchange usage
        IERC20(inputToken).approve(address(exchange), maxInputAmount);

        uint256 inputSold = exchange.swapWithExactOutput(
            inputToken,
            optionAddress,
            maxInputAmount,
            optionAmount,
            deadline,
            msg.sender,
            params
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
        uint256 deadline,
        bytes calldata params
    ) external {
        address optionAddress = address(option);

        // Take input amount from caller
        require(
            IERC20(inputToken).transferFrom(msg.sender, address(this), inputAmount),
            "Could not transfer tokens from caller"
        );

        // Approve exchange usage
        IERC20(inputToken).approve(address(exchange), inputAmount);

        uint256 outputBought = exchange.swapWithExactInput(
            inputToken,
            optionAddress,
            inputAmount,
            minOptionAmount,
            deadline,
            msg.sender,
            params
        );

        emit OptionsBought(msg.sender, optionAddress, outputBought, inputToken, inputAmount);
    }
}
