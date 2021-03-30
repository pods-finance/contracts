// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "./PodPut.sol";
import "../interfaces/IWETH.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title WPodPut
 * @author Pods Finance
 *
 * @notice Represents a tokenized Put option series for ETH. Internally it Wraps
 * ETH to treat it seamlessly.
 *
 * @dev Put options represents the right, not the obligation to sell the underlying asset
 * for strike price units of the strike asset.
 *
 * There are four main actions that can be done with an option:
 *
 * Sellers can mint fungible Put option tokens by locking strikePrice * amountOfOptions
 * strike asset units until expiration. Buyers can exercise their Put, meaning
 * selling their underlying asset for strikePrice * amountOfOptions units of strike asset.
 * At the end, seller can retrieve back its collateral, that could be the underlying asset
 * AND/OR strike based on the contract's current ratio of underlying and strike assets.
 *
 * There are many option's style, but the most usual are: American and European.
 * The difference between them are the moments that the buyer is allowed to exercise and
 * the moment that seller can retrieve its locked collateral.
 *
 *  Exercise:
 *  American -> any moment until expiration
 *  European -> only after expiration and until the end of the exercise window
 *
 *  Withdraw:
 *  American -> after expiration
 *  European -> after end of exercise window
 *
 * Let's take an example: there is such a put option series where buyers
 * may sell 1 ETH for 300 USDC until Dec 31, 2021.
 *
 * In this case:
 *
 * - Expiration date: Dec 31, 2021
 * - Underlying asset: ETH
 * - Strike asset: USDC
 * - Strike price: 300 USDC
 *
 * USDC holders may call mint() until the expiration date, which in turn:
 *
 * - Will lock their USDC into this contract
 * - Will issue put tokens corresponding to this USDC amount
 * - This contract is agnostic about where options could be bought or sold and how much the
 * the option premium should be.
 *
 * USDC holders who also hold the option tokens may call unmint() until the
 * expiration date, which in turn:
 *
 * - Will unlock their USDC from this contract
 * - Will burn the corresponding amount of put tokens
 *
 * Put token holders may call exerciseEth() until the expiration date, to
 * exercise their option, which in turn:
 *
 * - Will sell 1 ETH for 300 USDC (the strike price) each.
 * - Will burn the corresponding amount of put tokens.
 *
 * IMPORTANT: Note that after expiration, option tokens are worthless since they can not
 * be exercised and its price should be worth 0 in a healthy market.
 *
 */
contract WPodPut is PodPut {
    event Received(address indexed sender, uint256 value);

    constructor(
        string memory name,
        string memory symbol,
        IPodOption.ExerciseType exerciseType,
        address underlyingAsset,
        address strikeAsset,
        uint256 strikePrice,
        uint256 expiration,
        uint256 exerciseWindowSize,
        IConfigurationManager configurationManager
    )
        public
        PodPut(
            name,
            symbol,
            exerciseType,
            underlyingAsset,
            strikeAsset,
            strikePrice,
            expiration,
            exerciseWindowSize,
            configurationManager
        )
    {} // solhint-disable-line no-empty-blocks

    /**
     * @notice Unlocks collateral by burning option tokens.
     *
     * @dev In case of American options where exercise can happen before the expiration, caller
     * may receive a mix of underlying asset and strike asset.
     *
     * Options can only be burned while the series is NOT expired.
     *
     * @param amountOfOptions The amount option tokens to be burned
     */
    function unmint(uint256 amountOfOptions) external override tradeWindow {
        (uint256 strikeToSend, uint256 underlyingToSend, , uint256 underlyingReserves) = _burnOptions(
            amountOfOptions,
            msg.sender
        );
        require(strikeToSend > 0, "WPodPut: amount of options is too low");

        // Sends strike asset
        IERC20(strikeAsset()).safeTransfer(msg.sender, strikeToSend);

        // Sends the underlying asset if the option was exercised
        if (underlyingReserves > 0) {
            require(underlyingToSend > 0, "WPodPut: amount of options is too low");
            IWETH(underlyingAsset()).withdraw(underlyingToSend);
            Address.sendValue(msg.sender, underlyingToSend);
        }

        emit Unmint(msg.sender, amountOfOptions, strikeToSend, underlyingToSend);
    }

    /**
     * @notice Allow Put token holders to use them to sell some amount of units
     * of ETH for the amount * strike price units of the strike token.
     *
     * @dev It uses the amount of ETH sent to exchange to the strike amount
     *
     * During the process:
     *
     * - The amount of ETH is transferred into this contract as a payment for the strike tokens
     * - The ETH is wrapped into WETH
     * - The amount of ETH * strikePrice of strike tokens are transferred to the caller
     * - The amount of option tokens are burned
     *
     * On American options, this function can only called anytime before expiration.
     * For European options, this function can only be called during the exerciseWindow.
     * Meaning, after expiration and before the end of exercise window.
     */
    function exerciseEth() external payable exerciseWindow {
        uint256 amountOfOptions = msg.value;
        require(amountOfOptions > 0, "WPodPut: you can not exercise zero options");
        // Calculate the strike amount equivalent to pay for the underlying requested
        uint256 strikeToSend = _strikeToTransfer(amountOfOptions);

        // Burn the option tokens equivalent to the underlying requested
        _burn(msg.sender, amountOfOptions);

        // Retrieve the underlying asset from caller
        IWETH(underlyingAsset()).deposit{ value: msg.value }();

        // Releases the strike asset to caller, completing the exchange
        IERC20(strikeAsset()).safeTransfer(msg.sender, strikeToSend);

        emit Exercise(msg.sender, amountOfOptions);
    }

    /**
     * @notice After series expiration in case of American or after exercise window for European,
     * allow minters who have locked their strike asset tokens to withdraw them proportionally
     * to their minted options.
     *
     * @dev If assets had been exercised during the option series the minter may withdraw
     * the exercised assets or a combination of exercised and strike asset tokens.
     */
    function withdraw() external override withdrawWindow {
        (uint256 strikeToSend, uint256 underlyingToSend) = _withdraw();

        IERC20(strikeAsset()).safeTransfer(msg.sender, strikeToSend);

        if (underlyingToSend > 0) {
            IWETH(underlyingAsset()).withdraw(underlyingToSend);
            Address.sendValue(msg.sender, underlyingToSend);
        }

        emit Withdraw(msg.sender, strikeToSend, underlyingToSend);
    }

    receive() external payable {
        require(msg.sender == this.underlyingAsset(), "WPodPut: Only deposits from WETH are allowed");
        emit Received(msg.sender, msg.value);
    }
}
