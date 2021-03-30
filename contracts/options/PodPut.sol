// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "./PodOption.sol";

/**
 * @title PodPut
 * @author Pods Finance
 *
 * @notice Represents a tokenized Put option series for some long/short token pair.
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
 * Let's take an example: there is such an European Put option series where buyers
 * may sell 1 WETH for 300 USDC until Dec 31, 2021.
 *
 * In this case:
 *
 * - Expiration date: Dec 31, 2021
 * - Underlying asset: WETH
 * - Strike asset: USDC
 * - Strike price: 300 USDC
 *
 * USDC holders may call mint() until the expiration date, which in turn:
 *
 * - Will lock their USDC into this contract
 * - Will mint/issue option tokens corresponding to this USDC amount
 * - This contract is agnostic about where to sell/buy and how much should be the
 * the option premium.
 *
 * USDC holders who also hold the option tokens may call unmint() until the
 * expiration date, which in turn:
 *
 * - Will unlock their USDC from this contract
 * - Will burn the corresponding amount of options tokens
 *
 * Option token holders may call exercise() after the expiration date and
 * before the end of exercise window, to exercise their option, which in turn:
 *
 * - Will sell 1 ETH for 300 USDC (the strike price) each.
 * - Will burn the corresponding amount of option tokens.
 *
 * USDC holders that minted options initially can call withdraw() after the
 * end of exercise window, which in turn:
 *
 * - Will give back its amount of collateral locked. That could be o mix of
 * underlying asset and strike asset based if and how the pool was exercised.
 *
 * IMPORTANT: Note that after expiration, option tokens are worthless since they can not
 * be exercised and its price should worth 0 in a healthy market.
 *
 */
contract PodPut is PodOption {
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
        PodOption(
            name,
            symbol,
            IPodOption.OptionType.PUT,
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
     * @notice Locks strike asset and write option tokens.
     *
     * @dev The issued amount ratio is 1:1, i.e., 1 option token for 1 underlying token.
     *
     * It presumes the caller has already called IERC20.approve() on the
     * strike token contract to move caller funds.
     *
     * This function is meant to be called by strike token holders wanting
     * to write option tokens. Calling it will lock `amountOfOptions` * `strikePrice`
     * units of `strikeToken` into this contract
     *
     * Options can only be minted while the series is NOT expired.
     *
     * It is also important to notice that options will be sent back
     * to `msg.sender` and not the `owner`. This behavior is designed to allow
     * proxy contracts to mint on others behalf. The `owner` will be able to remove
     * the deposited collateral after series expiration or by calling unmint(), even
     * if a third-party minted options on its behalf.
     *
     * @param amountOfOptions The amount option tokens to be issued
     * @param owner Which address will be the owner of the options
     */
    function mint(uint256 amountOfOptions, address owner) external override tradeWindow {
        require(amountOfOptions > 0, "PodPut: you can not mint zero options");

        uint256 amountToTransfer = _strikeToTransfer(amountOfOptions);
        _mintOptions(amountOfOptions, amountToTransfer, owner);

        IERC20(strikeAsset()).safeTransferFrom(msg.sender, address(this), amountToTransfer);

        emit Mint(owner, amountOfOptions);
    }

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
    function unmint(uint256 amountOfOptions) external virtual override tradeWindow {
        (uint256 strikeToSend, uint256 underlyingToSend, , uint256 underlyingReserves) = _burnOptions(
            amountOfOptions,
            msg.sender
        );
        require(strikeToSend > 0, "PodPut: amount of options is too low");

        // Sends strike asset
        IERC20(strikeAsset()).safeTransfer(msg.sender, strikeToSend);

        // Sends the underlying asset if the option was exercised
        if (underlyingReserves > 0) {
            require(underlyingToSend > 0, "PodPut: amount of options is too low");
            IERC20(underlyingAsset()).safeTransfer(msg.sender, underlyingToSend);
        }

        emit Unmint(msg.sender, amountOfOptions, strikeToSend, underlyingToSend);
    }

    /**
     * @notice Allow Put token holders to use them to sell some amount of units
     * of the underlying token for the amount * strike price units of the
     * strike token.
     *
     * @dev It presumes the caller has already called IERC20.approve() on the
     * underlying token contract to move caller funds.
     *
     * During the process:
     *
     * - The amount * strikePrice of strike tokens are transferred to the caller
     * - The amount of option tokens are burned
     * - The amount of underlying tokens are transferred into
     * this contract as a payment for the strike tokens
     *
     * On American options, this function can only called anytime before expiration.
     * For European options, this function can only be called during the exerciseWindow.
     * Meaning, after expiration and before the end of exercise window.
     *
     * @param amountOfOptions The amount option tokens to be exercised
     */
    function exercise(uint256 amountOfOptions) external virtual override exerciseWindow {
        require(amountOfOptions > 0, "PodPut: you can not exercise zero options");
        // Calculate the strike amount equivalent to pay for the underlying requested
        uint256 amountOfStrikeToTransfer = _strikeToTransfer(amountOfOptions);

        // Burn the option tokens equivalent to the underlying requested
        _burn(msg.sender, amountOfOptions);

        // Retrieve the underlying asset from caller
        IERC20(underlyingAsset()).safeTransferFrom(msg.sender, address(this), amountOfOptions);

        // Releases the strike asset to caller, completing the exchange
        IERC20(strikeAsset()).safeTransfer(msg.sender, amountOfStrikeToTransfer);

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
    function withdraw() external virtual override withdrawWindow {
        (uint256 strikeToSend, uint256 underlyingToSend) = _withdraw();

        IERC20(strikeAsset()).safeTransfer(msg.sender, strikeToSend);

        if (underlyingToSend > 0) {
            IERC20(underlyingAsset()).safeTransfer(msg.sender, underlyingToSend);
        }
        emit Withdraw(msg.sender, strikeToSend, underlyingToSend);
    }
}
