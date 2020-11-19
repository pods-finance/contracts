// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "./PodOption.sol";

/**
 * This contract represents a tokenized European call option series for some
 * long/short token pair.
 *
 * Call options represents the right, not the obligation to buy the underlying asset
 * for strike price units of the strike asset.
 *
 * There are four main actions that can be done with an option:
 *
 *
 * Sellers can mint fungible call option tokens by locking 1:1 units
 * of underlying asset until expiration. Buyers can exercise their call, meaning
 * buying the locked underlying asset for strike price units of strike asset.
 * At the end, seller can retrieve back his collateral, that could be the underlying asset
 * AND/OR strike based on his initial position.
 *
 * There are many option's style, but the most usual are: American and European.
 * The difference between them are the moments that the buyer is allowed to exercise and
 * the moment that seller can retrieve his locked collateral.
 *
 *  Exercise:
 *  American -> any moment until expiration
 *  European -> only after expiration and until the end of the exercise window
 *
 *  Withdraw:
 *  American -> after expiration
 *  European -> after end of exercise window
 *
 * Let's take an example: there is such an European call option series where buyers
 * may buy 1 WETH for 300 USDC until Dec 31, 2020.
 *
 * In this case:
 *
 * - Expiration date: Dec 31, 2020
 * - Underlying asset: WETH
 * - Strike asset: USDC
 * - Strike price: 300 USDC
 *
 * ETH holders may call mint() until the expiration date, which in turn:
 *
 * - Will lock their WETH into this contract
 * - Will issue option tokens corresponding to this WETH amount
 * - These options could be sold in our AMM or in any other market
 *
 * WETH holders who also hold the option tokens may call unmint() until the
 * expiration date, which in turn:
 *
 * - Will unlock their WETH from this contract
 * - Will burn the corresponding amount of options tokens
 *
 * Option token holders may call exercise() after the expiration date and
 * end of before exercise window, to exercise their option, which in turn:
 *
 * - Will buy 1 ETH for 300 USDC (the strike price) each.
 * - Will burn the corresponding amount of option tokens.
 *
 * WETH holders that minted options initially can call withdraw() after the
 * end of exercise window, which in turn:
 *
 * - Will give back his amount of collateral locked. That could be o mix of
 * underlying asset and strike asset based if and how the pool was exercised.
 *
 */
contract PodCall is PodOption {
    using SafeMath for uint8;

    constructor(
        string memory _name,
        string memory _symbol,
        PodOption.OptionType _optionType,
        address _underlyingAsset,
        address _strikeAsset,
        uint256 _strikePrice,
        uint256 _expiration,
        uint256 _exerciseWindowSize
    )
        public
        PodOption(
            _name,
            _symbol,
            _optionType,
            _underlyingAsset,
            _strikeAsset,
            _strikePrice,
            _expiration,
            _exerciseWindowSize
        )
    {}

    /**
     * @notice Gets the amount of minted options given amount of strikeAsset`.
     * @param strikeAmount of options that protect 1:1 underlying asset.
     * @return optionsAmount amount of strike asset.
     */
    function amountOfMintedOptions(uint256 strikeAmount) external view returns (uint256) {
        return _underlyingToTransfer(strikeAmount);
    }

    /**
     * @notice Gets the amount of strikeAsset necessary to mint a given amount of options`.
     * @param amount of options that protect 1:1 underlying asset.
     * @return strikeAmount amount of strike asset.
     */
    function strikeToTransfer(uint256 amount) external view returns (uint256) {
        return _strikeToTransfer(amount);
    }

    /**
     * Locks some amount of the strike token and writes option tokens.
     *
     * The issued amount ratio is 1:1, i.e., 1 option token for 1 underlying token.
     *
     * It presumes the caller has already called IERC20.approve() on the
     * strike token contract to move caller funds.
     *
     * This function is meant to be called by strike token holders wanting
     * to write option tokens.
     *
     * Options can only be minted while the series is NOT expired.
     *
     * @param amount The amount option tokens to be issued; this will lock
     * for instance amount * strikePrice units of strikeToken into this
     * contract
     * @param owner Which address will be the owner of the options
     */
    function mint(uint256 amount, address owner) external virtual override beforeExpiration {
        lockedBalance[owner] = lockedBalance[owner].add(amount);
        _mint(msg.sender, amount);

        require(
            ERC20(underlyingAsset).transferFrom(msg.sender, address(this), amount),
            "Could not transfer strike tokens from caller"
        );
        emit Mint(owner, amount);
    }

    /**
     * Unlocks the amount of the underlying token by burning option tokens.
     *
     * This mechanism ensures that users can only redeem tokens they've
     * previously lock into this contract.
     *
     * Options can only be burned while the series is NOT expired.
     * @param amount The amount option tokens to be burned
     */
    function unwind(uint256 amount) external virtual override beforeExpiration {
        require(amount <= lockedBalance[msg.sender], "Not enough balance");

        // Burn option tokens
        lockedBalance[msg.sender] = lockedBalance[msg.sender].sub(amount);
        _burn(msg.sender, amount);

        // Unlocks the strike token
        require(ERC20(underlyingAsset).transfer(msg.sender, amount), "Could not transfer back strike tokens to caller");
        emit Unwind(msg.sender, amount);
    }

    /**
     * Allow call token holders to use them to buy some amount of units
     * of the underlying token for the amount * strike price units of the
     * strike token.
     *
     * It presumes the caller has already called IERC20.approve() on the
     * strike token contract to move caller funds.
     *
     * During the process:
     *
     * - The amount * strikePrice of strike tokens are transferred from the
     * caller
     * - The amount of option tokens are burned
     * - The amount of underlying tokens are transferred to the caller
     *
     * Options can only be exchanged while the series is BETWEEN window of exercise.
     * @param amount The amount option tokens to be exercised
     */
    function exercise(uint256 amount) external override afterExpiration beforeExerciseWindow {
        require(amount > 0, "Null amount");
        // Calculate the strike amount equivalent to pay for the underlying requested
        uint256 amountStrikeToTransfer = _strikeToTransfer(amount);
        require(amountStrikeToTransfer > 0, "Amount too low");

        // Burn the option tokens equivalent to the underlying requested
        _burn(msg.sender, amount);

        // Retrieve the underlying asset from caller
        require(
            ERC20(strikeAsset).transferFrom(msg.sender, address(this), amountStrikeToTransfer),
            "Could not transfer underlying tokens from caller"
        );

        // Releases the strike asset to caller, completing the exchange
        require(ERC20(underlyingAsset).transfer(msg.sender, amount), "Could not transfer underlying tokens to caller");
        emit Exercise(msg.sender, amount);
    }

    /**
     * After series expiration, allow addresses who have locked their underlying
     * asset tokens to withdraw them on first-come-first-serve basis.
     *
     * If there is not enough of strike asset because the series have been
     * exercised, the remaining balance is converted into the strike asset
     * and given to the caller.
     */
    function withdraw() external virtual override afterExerciseWindow {
        uint256 amount = lockedBalance[msg.sender];
        require(amount > 0, "You do not have balance to withdraw");

        // Calculates how many underlying/strike tokens the caller
        // will get back
        uint256 currentUnderlyingBalance = ERC20(underlyingAsset).balanceOf(address(this));
        // uint256 underlyingToReceive = _strikeToTransfer(amount);
        uint256 underlyingToReceive = amount;
        uint256 strikeToReceive = 0;
        if (underlyingToReceive > currentUnderlyingBalance) {
            uint256 remainingUnderlyingAmount = underlyingToReceive.sub(currentUnderlyingBalance);
            strikeToReceive = _strikeToTransfer(remainingUnderlyingAmount);
        }

        lockedBalance[msg.sender] = lockedBalance[msg.sender].sub(amount);

        // Unlocks the underlying/strike tokens
        if (strikeToReceive > 0) {
            require(
                ERC20(strikeAsset).transfer(msg.sender, strikeToReceive),
                "Could not transfer back strike tokens to caller"
            );
        }
        if (underlyingToReceive > 0) {
            require(
                ERC20(underlyingAsset).transfer(msg.sender, underlyingToReceive),
                "Could not transfer back underlying tokens to caller"
            );
        }
        emit Withdraw(msg.sender, amount);
    }

    function _strikeToTransfer(uint256 amount) internal view returns (uint256) {
        uint256 strikeAmount = amount.mul(strikePrice).div(
            10**underlyingAssetDecimals.add(strikePriceDecimals).sub(strikeAssetDecimals)
        );
        return strikeAmount;
    }

    function _underlyingToTransfer(uint256 strikeAmount) internal view returns (uint256) {
        uint256 underlyingAmount = strikeAmount
            .mul(10**underlyingAssetDecimals.add(strikePriceDecimals).sub(strikeAssetDecimals))
            .div(strikePrice);

        return underlyingAmount;
    }
}
