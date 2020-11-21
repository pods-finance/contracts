// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "./PodOption.sol";

/**
 * Represents a tokenized european call option series for some
 * long/short token pair.
 *
 * It is fungible and it is meant to be freely tradable until its
 * expiration time, when its transfer functions will be blocked
 * and the only available operation will be for the option writers
 * to unlock their collateral.
 *
 * Let's take an example: there is such a call option series where buyers
 * may buy 1 ETH for 500 USDC until Dec 31, 2020.
 *
 * In this case:
 *
 * - Expiration date: Dec 31, 2019
 * - Underlying asset: ETH
 * - Strike asset: USDC
 * - Strike price: 500 USDC
 *
 * ETH holders may call mint() until the expiration date, which in turn:
 *
 * - Will lock their ETH into this contract
 * - Will issue call tokens corresponding to this USDC amount
 * - These call tokens will be freely tradable until the expiration date
 *
 * ETH holders who also hold the option tokens may call unwind() until the
 * expiration date, which in turn:
 *
 * - Will unlock their ETH from this contract
 * - Will unwind the corresponding amount of call tokens
 *
 * Call token holders may call exercise() between the expiration date and end of the exercise window, to
 * exercise their option, which in turn:
 *
 * - Will buy 1 ETH for 500 USDC (the strike price) each.
 * - Will burn the corresponding amount of call tokens.
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
            IERC20(underlyingAsset).transferFrom(msg.sender, address(this), amount),
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
        require(
            IERC20(underlyingAsset).transfer(msg.sender, amount),
            "Could not transfer back strike tokens to caller"
        );
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
            IERC20(strikeAsset).transferFrom(msg.sender, address(this), amountStrikeToTransfer),
            "Could not transfer underlying tokens from caller"
        );

        // Releases the strike asset to caller, completing the exchange
        require(IERC20(underlyingAsset).transfer(msg.sender, amount), "Could not transfer underlying tokens to caller");
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
        uint256 currentUnderlyingBalance = IERC20(underlyingAsset).balanceOf(address(this));
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
                IERC20(strikeAsset).transfer(msg.sender, strikeToReceive),
                "Could not transfer back strike tokens to caller"
            );
        }
        if (underlyingToReceive > 0) {
            require(
                IERC20(underlyingAsset).transfer(msg.sender, underlyingToReceive),
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
