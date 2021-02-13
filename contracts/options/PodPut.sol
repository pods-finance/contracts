// SPDX-License-Identifier: MIT
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
 * AND/OR strike based on its initial position.
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
 * may buy 1 WETH for 300 USDC until Dec 31, 2020.
 *
 * In this case:
 *
 * - Expiration date: Dec 31, 2020
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
        string memory _name,
        string memory _symbol,
        IPodOption.ExerciseType _exerciseType,
        address _underlyingAsset,
        address _strikeAsset,
        uint256 _strikePrice,
        uint256 _expiration,
        uint256 _exerciseWindowSize,
        IConfigurationManager _configurationManager
    )
        public
        PodOption(
            _name,
            _symbol,
            IPodOption.OptionType.PUT,
            _exerciseType,
            _underlyingAsset,
            _strikeAsset,
            _strikePrice,
            _expiration,
            _exerciseWindowSize,
            _configurationManager
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
     * proxy contracts to mint on others behalf
     *
     * @param amountOfOptions The amount option tokens to be issued
     * @param owner Which address will be the owner of the options
     */
    function mint(uint256 amountOfOptions, address owner) external override beforeExpiration {
        require(amountOfOptions > 0, "PodPut: you can not mint zero options");

        uint256 amountToTransfer = _strikeToTransfer(amountOfOptions);
        _mintOptions(amountOfOptions, amountToTransfer, owner);

        require(
            IERC20(strikeAsset()).transferFrom(msg.sender, address(this), amountToTransfer),
            "PodPut: could not transfer strike tokens from caller"
        );
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
    function unmint(uint256 amountOfOptions) external virtual override beforeExpiration {
        uint256 ownerShares = shares[msg.sender];
        require(ownerShares > 0, "PodPut: you do not have minted options");

        uint256 userMintedOptions = mintedOptions[msg.sender];
        require(amountOfOptions <= userMintedOptions, "PodPut: not enough minted options");

        uint256 strikeReserves = IERC20(strikeAsset()).balanceOf(address(this));
        uint256 underlyingReserves = IERC20(underlyingAsset()).balanceOf(address(this));

        uint256 ownerSharesToReduce = ownerShares.mul(amountOfOptions).div(userMintedOptions);
        uint256 strikeToSend = ownerSharesToReduce.mul(strikeReserves).div(totalShares);
        uint256 underlyingToSend = ownerSharesToReduce.mul(underlyingReserves).div(totalShares);

        require(strikeToSend > 0, "PodPut: amount of options is too low");

        shares[msg.sender] = shares[msg.sender].sub(ownerSharesToReduce);
        mintedOptions[msg.sender] = mintedOptions[msg.sender].sub(amountOfOptions);
        totalShares = totalShares.sub(ownerSharesToReduce);

        _burn(msg.sender, amountOfOptions);

        // Unlocks the strike token
        require(
            IERC20(strikeAsset()).transfer(msg.sender, strikeToSend),
            "PodPut: could not transfer strike tokens back to caller"
        );

        if (underlyingReserves > 0) {
            require(underlyingToSend > 0, "PodPut: amount of options is too low");
            require(
                IERC20(underlyingAsset()).transfer(msg.sender, underlyingToSend),
                "PodPut: could not transfer underlying tokens back to caller"
            );
        }
        emit Unmint(msg.sender, amountOfOptions);
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
        require(
            IERC20(underlyingAsset()).transferFrom(msg.sender, address(this), amountOfOptions),
            "PodPut: could not transfer underlying tokens from caller"
        );

        // Releases the strike asset to caller, completing the exchange
        require(
            IERC20(strikeAsset()).transfer(msg.sender, amountOfStrikeToTransfer),
            "PodPut: could not transfer strike tokens to caller"
        );
        emit Exercise(msg.sender, amountOfOptions);
    }

    /**
     * @notice After series expiration, allow minters who have locked their
     * strike asset tokens to withdraw them proportionally to their minted options.
     *
     * @dev If assets had been exercised during the option series the minter may withdraw
     * the exercised assets or a combination of exercised and strike asset tokens.
     */
    function withdraw() external virtual override withdrawWindow {
        uint256 ownerShares = shares[msg.sender];
        require(ownerShares > 0, "PodPut: you do not have balance to withdraw");

        uint256 strikeReserves = IERC20(strikeAsset()).balanceOf(address(this));
        uint256 underlyingReserves = IERC20(underlyingAsset()).balanceOf(address(this));

        uint256 strikeToSend = ownerShares.mul(strikeReserves).div(totalShares);
        uint256 underlyingToSend = ownerShares.mul(underlyingReserves).div(totalShares);

        shares[msg.sender] = shares[msg.sender].sub(ownerShares);
        totalShares = totalShares.sub(ownerShares);

        require(
            IERC20(strikeAsset()).transfer(msg.sender, strikeToSend),
            "PodPut: could not transfer strike tokens back to caller"
        );
        if (underlyingReserves > 0) {
            require(
                IERC20(underlyingAsset()).transfer(msg.sender, underlyingToSend),
                "PodPut: could not transfer underlying tokens back to caller"
            );
        }
        emit Withdraw(msg.sender, mintedOptions[msg.sender]);
    }
}
