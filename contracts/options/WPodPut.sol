// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "./PodPut.sol";
import "../interfaces/IWETH.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * Represents a tokenized american put option series for ETH.
 * Internally it Wraps ETH to treat it seamlessly.
 *
 * It is fungible and it is meant to be freely tradable until its
 * expiration time, when its transfer functions will be blocked
 * and the only available operation will be for the option writers
 * to unlock their collateral.
 *
 * Let's take an example: there is such a put option series where buyers
 * may sell 1 ETH for 300 USDC until Dec 31, 2019.
 *
 * In this case:
 *
 * - Expiration date: Dec 31, 2019
 * - Underlying asset: DAI
 * - Strike asset: USDC
 * - Strike price: 300 USDC
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
 * Put token holders may call exerciseEth() until the expiration date, to
 * exercise their option, which in turn:
 *
 * - Will sell 1 ETH for 300 USDC (the strike price) each.
 * - Will burn the corresponding amount of put tokens.
 */
contract WPodPut is PodPut {
    IWETH public weth;

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
        PodPut(
            _name,
            _symbol,
            _exerciseType,
            _underlyingAsset,
            _strikeAsset,
            _strikePrice,
            _expiration,
            _exerciseWindowSize
        )
    {
        weth = IWETH(_underlyingAsset);
    }

    event Received(address sender, uint256 value);

    /**
     * Unlocks some amount of the strike token by burning option tokens.
     *
     * This mechanism ensures that users can only redeem tokens they've
     * previously lock into this contract.
     *
     * Options can only be burned while the series is NOT expired.
     */
    function unmint(uint256 amountOfOptions) external override beforeExpiration {
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
            weth.withdraw(underlyingToSend);
            Address.sendValue(msg.sender, underlyingToSend);
        }
        emit Unmint(msg.sender, amountOfOptions);
    }

    /**
     * Allow put token holders to use them to sell some amount of units
     * of ETH for the amount * strike price units of the strike token.
     *
     * It uses the amount of ETH sent to exchange to the strike amount
     *
     * During the process:
     *
     * - The amount of ETH is transferred into this contract as a payment
     * for the strike tokens
     * - The ETH is wrapped into WETH
     * - The amount of ETH * strikePrice of strike tokens are transferred to the
     * caller
     * - The amount of option tokens are burned
     *
     * Options can only be exchanged while the series is NOT expired.
     */
    function exerciseEth() external payable exerciseWindow {
        uint256 amountOfOptions = msg.value;
        require(amountOfOptions > 0, "Null amount");
        // Calculate the strike amount equivalent to pay for the underlying requested
        uint256 strikeToSend = _strikeToTransfer(amountOfOptions);

        // Burn the option tokens equivalent to the underlying requested
        _burn(msg.sender, amountOfOptions);

        // Retrieve the underlying asset from caller
        weth.deposit{ value: msg.value }();
        // Releases the strike asset to caller, completing the exchange
        require(
            IERC20(strikeAsset).transfer(msg.sender, strikeToSend),
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
    function withdraw() external override withdrawWindow {
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
            weth.withdraw(underlyingToSend);
            Address.sendValue(msg.sender, underlyingToSend);
        }
        emit Withdraw(msg.sender, mintedOptions[msg.sender]);
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }
}
