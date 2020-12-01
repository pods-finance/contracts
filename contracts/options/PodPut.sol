// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "./PodOption.sol";

/**
 * This contract represents a tokenized Put option series for some
 * long/short token pair.
 *
 * Put options represents the right, not the obligation to sell the underlying asset
 * for strike price units of the strike asset.
 *
 * There are four main actions that can be done with an option:
 *
 * Sellers can mint fungible Put option tokens by locking strikePrice * amountOfOptions
 * strike asset units until expiration. Buyers can exercise their Put, meaning
 * selling their underlying asset for strikePrice * amountOfOptions units of strike asset.
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
 * - Will give back his amount of collateral locked. That could be o mix of
 * underlying asset and strike asset based if and how the pool was exercised.
 *
 */
contract PodPut is PodOption {
    constructor(
        string memory _name,
        string memory _symbol,
        PodOption.ExerciseType _exerciseType,
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
            PodOption.OptionType.PUT,
            _exerciseType,
            _underlyingAsset,
            _strikeAsset,
            _strikePrice,
            _expiration,
            _exerciseWindowSize
        )
    {}

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
     * @param amountOfOptions The amount option tokens to be issued; this will lock
     * for instance amount * strikePrice units of strikeToken into this
     * contract
     */
    function mint(uint256 amountOfOptions, address owner) external override beforeExpiration {
        require(amountOfOptions > 0, "Null amount");

        uint256 amountToTransfer = _strikeToTransfer(amountOfOptions);

        if (totalShares > 0) {
            uint256 strikeReserves = IERC20(strikeAsset).balanceOf(address(this));
            uint256 underlyingReserves = IERC20(underlyingAsset).balanceOf(address(this));

            uint256 numerator = amountToTransfer.mul(totalShares);
            uint256 denominator = strikeReserves.add(
                underlyingReserves.mul(strikePrice).div((uint256(10)**underlyingAssetDecimals))
            );

            uint256 ownerShares = numerator.div(denominator);
            totalShares = totalShares.add(ownerShares);
            mintedOptions[owner] = mintedOptions[owner].add(amountOfOptions);
            shares[owner] = shares[owner].add(ownerShares);
        } else {
            shares[owner] = amountToTransfer;
            mintedOptions[owner] = amountOfOptions;
            totalShares = amountToTransfer;
        }

        _mint(msg.sender, amountOfOptions);
        require(
            IERC20(strikeAsset).transferFrom(msg.sender, address(this), amountToTransfer),
            "Couldn't transfer strike tokens from caller"
        );
        emit Mint(owner, amountOfOptions);
    }

    /**
     * Unlocks some amount of the strike token by burning option tokens.
     *
     * This mechanism ensures that users can only redeem tokens they've
     * previously lock into this contract.
     *
     * Options can only be burned while the series is NOT expired.
     */
    function unmint(uint256 amountOfOptions) external virtual override beforeExpiration {
        uint256 ownerShares = shares[msg.sender];
        require(ownerShares > 0, "You do not have minted options");

        uint256 userMintedOptions = mintedOptions[msg.sender];
        require(amountOfOptions <= userMintedOptions, "Exceed address minted options");

        uint256 strikeReserves = IERC20(strikeAsset).balanceOf(address(this));
        uint256 underlyingReserves = IERC20(underlyingAsset).balanceOf(address(this));

        uint256 ownerSharesToReduce = ownerShares.mul(amountOfOptions).div(userMintedOptions);

        uint256 strikeToSend = ownerSharesToReduce.mul(strikeReserves).div(totalShares);
        uint256 underlyingToSend = ownerSharesToReduce.mul(underlyingReserves).div(totalShares);

        require(strikeToSend > 0, "Amount too low");

        shares[msg.sender] = shares[msg.sender].sub(ownerSharesToReduce);
        mintedOptions[msg.sender] = mintedOptions[msg.sender].sub(amountOfOptions);
        totalShares = totalShares.sub(ownerSharesToReduce);

        _burn(msg.sender, amountOfOptions);

        // Unlocks the strike token
        require(
            IERC20(strikeAsset).transfer(msg.sender, strikeToSend),
            "Couldn't transfer back strike tokens to caller"
        );

        if (underlyingReserves > 0) {
            require(underlyingToSend > 0, "Amount too low");
            require(
                IERC20(underlyingAsset).transfer(msg.sender, underlyingToSend),
                "Couldn't transfer back strike tokens to caller"
            );
        }
        emit Unmint(msg.sender, amountOfOptions);
    }

    /**
     * Allow put token holders to use them to sell some amount of units
     * of the underlying token for the amount * strike price units of the
     * strike token.
     *
     * It presumes the caller has already called IERC20.approve() on the
     * underlying token contract to move caller funds.
     *
     * During the process:
     *
     * - The amount * strikePrice of strike tokens are transferred to the
     * caller
     * - The amount of option tokens are burned
     * - The amount of underlying tokens are transferred into
     * this contract as a payment for the strike tokens
     *
     * Options can only be exchanged while the series is NOT expired.
     * @param amountOfOptions The amount option tokens to be exercised
     */
    function exercise(uint256 amountOfOptions) external virtual override exerciseWindow {
        require(amountOfOptions > 0, "Null amount");
        // Calculate the strike amount equivalent to pay for the underlying requested
        uint256 amountOfStrikeToTransfer = _strikeToTransfer(amountOfOptions);
        require(amountOfStrikeToTransfer > 0, "Amount too low");

        // Burn the option tokens equivalent to the underlying requested
        _burn(msg.sender, amountOfOptions);

        // Retrieve the underlying asset from caller
        require(
            IERC20(underlyingAsset).transferFrom(msg.sender, address(this), amountOfOptions),
            "Could not transfer underlying tokens from caller"
        );

        // Releases the strike asset to caller, completing the exchange
        require(
            IERC20(strikeAsset).transfer(msg.sender, amountOfStrikeToTransfer),
            "Could not transfer underlying tokens to caller"
        );
        emit Exercise(msg.sender, amountOfOptions);
    }

    /**
     * After series expiration, allow addresses who have locked their strike
     * asset tokens to withdraw them on first-come-first-serve basis.
     *
     * If there is not enough of strike asset because the series have been
     * exercised, the remaining balance is converted into the underlying asset
     * and given to the caller.
     */
    function withdraw() external virtual override withdrawWindow {
        uint256 ownerShares = shares[msg.sender];
        require(ownerShares > 0, "You do not have balance to withdraw");

        uint256 strikeReserves = IERC20(strikeAsset).balanceOf(address(this));
        uint256 underlyingReserves = IERC20(underlyingAsset).balanceOf(address(this));

        uint256 strikeToSend = ownerShares.mul(strikeReserves).div(totalShares);
        uint256 underlyingToSend = ownerShares.mul(underlyingReserves).div(totalShares);

        shares[msg.sender] = shares[msg.sender].sub(ownerShares);
        totalShares = totalShares.sub(ownerShares);

        require(
            IERC20(strikeAsset).transfer(msg.sender, strikeToSend),
            "Could not transfer back strike tokens to caller"
        );
        if (underlyingReserves > 0) {
            require(
                IERC20(underlyingAsset).transfer(msg.sender, underlyingToSend),
                "Could not transfer back underlying tokens to caller"
            );
        }
        emit Withdraw(msg.sender, mintedOptions[msg.sender]);
    }
}
