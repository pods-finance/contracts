// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "./PodOption.sol";

/**
 * Represents a tokenized american put option series for some
 * long/short token pair.
 *
 * It is fungible and it is meant to be freely tradeable until its
 * expiration time, when its transfer functions will be blocked
 * and the only available operation will be for the option writers
 * to unlock their collateral.
 *
 * Let's take an example: there is such a put option series where buyers
 * may sell 1 DAI for 1 USDC until Dec 31, 2019.
 *
 * In this case:
 *
 * - Expiration date: Dec 31, 2019
 * - Underlying asset: DAI
 * - Strike asset: USDC
 * - Strike price: 1 USDC
 *
 * USDC holders may call mint() until the expiration date, which in turn:
 *
 * - Will lock their USDC into this contract
 * - Will issue put tokens corresponding to this USDC amount
 * - These put tokens will be freely tradable until the expiration date
 *
 * USDC holders who also hold the option tokens may call burn() until the
 * expiration date, which in turn:
 *
 * - Will unlock their USDC from this contract
 * - Will burn the corresponding amount of put tokens
 *
 * Put token holders may call redeem() until the expiration date, to
 * exercise their option, which in turn:
 *
 * - Will sell 1 DAI for 1 USDC (the strike price) each.
 * - Will burn the corresponding amount of put tokens.
 */
contract PodPut is PodOption {
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
        require(amountToTransfer > 0, "Amount too low");

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
    function exercise(uint256 amountOfOptions) external override afterExpiration beforeExerciseWindow {
        require(amountOfOptions > 0, "Null amount");
        // Calculate the strike amount equivalent to pay for the underlying requested
        uint256 amountOfStrikeToTransfer = _strikeToTransfer(amountOfOptions);
        require(amountOfStrikeToTransfer > 0, "Amount too low");

        // Burn the option tokens equivalent to the underlying requested
        _burn(msg.sender, amountOfOptions);

        // Retrieve the underlying asset from caller
        require(
            ERC20(underlyingAsset).transferFrom(msg.sender, address(this), amountOfOptions),
            "Could not transfer underlying tokens from caller"
        );

        // Releases the strike asset to caller, completing the exchange
        require(
            ERC20(strikeAsset).transfer(msg.sender, amountOfStrikeToTransfer),
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
    function withdraw() external virtual override afterExerciseWindow {
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
            "Couldn't transfer back strike tokens to caller"
        );
        if (underlyingReserves > 0) {
            require(
                IERC20(underlyingAsset).transfer(msg.sender, underlyingToSend),
                "Couldn't transfer back strike tokens to caller"
            );
        }
        emit Withdraw(msg.sender, mintedOptions[msg.sender]);
    }
}
