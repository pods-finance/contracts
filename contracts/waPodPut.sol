// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "./aPodPut.sol";
import "./interfaces/IWETH.sol";
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
contract waPodPut is aPodPut {
    IWETH public weth;

    constructor(
        string memory _name,
        string memory _symbol,
        PodOption.OptionType _optionType,
        address _underlyingAsset,
        address _strikeAsset,
        uint256 _strikePrice,
        uint256 _expirationBlockNumber
    )
        public
        aPodPut(_name, _symbol, _optionType, _underlyingAsset, _strikeAsset, _strikePrice, _expirationBlockNumber)
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
    function unwind(uint256 amount) external override beforeExpiration {
        uint256 weightedBalance = weightedBalances[msg.sender];
        require(weightedBalance > 0, "You do not have minted options");

        uint256 userMintedOptions = mintedOptions[msg.sender];
        require(amount <= userMintedOptions, "Exceed address minted options");

        uint256 strikeReserves = ERC20(strikeAsset).balanceOf(address(this));
        uint256 underlyingReserves = ERC20(underlyingAsset).balanceOf(address(this));

        uint256 userWeightedWithdraw = weightedBalance.mul(amount).div(userMintedOptions);
        uint256 strikeToReceive = userWeightedWithdraw.mul(strikeReserves).div(totalLockedWeighted);
        uint256 underlyingToReceive = userWeightedWithdraw.mul(underlyingReserves).div(totalLockedWeighted);
        require(strikeToReceive > 0, "Amount too low");

        weightedBalances[msg.sender] = weightedBalances[msg.sender].sub(userWeightedWithdraw);
        mintedOptions[msg.sender] = mintedOptions[msg.sender].sub(amount);
        totalLockedWeighted = totalLockedWeighted.sub(userWeightedWithdraw);

        _burn(msg.sender, amount);

        // Unlocks the strike token
        require(
            ERC20(strikeAsset).transfer(msg.sender, strikeToReceive),
            "Couldn't transfer back strike tokens to caller"
        );

        if (underlyingReserves > 0) {
            require(underlyingToReceive > 0, "Amount too low");
            weth.withdraw(underlyingToReceive);
            Address.sendValue(msg.sender, underlyingToReceive);
        }
        emit Unwind(msg.sender, amount);
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
    function exerciseEth() external payable beforeExpiration {
        uint256 amount = msg.value;
        require(amount > 0, "Null amount");
        // Calculate the strike amount equivalent to pay for the underlying requested
        uint256 amountStrikeToTransfer = _strikeToTransfer(amount);
        require(amountStrikeToTransfer > 0, "Amount too low");

        // Burn the option tokens equivalent to the underlying requested
        _burn(msg.sender, amount);

        // Retrieve the underlying asset from caller
        weth.deposit{ value: msg.value }();
        // Releases the strike asset to caller, completing the exchange
        require(
            ERC20(strikeAsset).transfer(msg.sender, amountStrikeToTransfer),
            "Could not transfer underlying tokens to caller"
        );
        emit Exercise(msg.sender, amount);
    }

    /**
     * After series expiration, allow addresses who have locked their strike
     * asset tokens to withdraw them on first-come-first-serve basis.
     *
     * If there is not enough of strike asset because the series have been
     * exercised, the remaining balance is converted into the underlying asset
     * and given to the caller.
     */
    function withdraw() external override afterExpiration {
        uint256 weightedBalance = weightedBalances[msg.sender];
        require(weightedBalance > 0, "You do not have balance to withdraw");

        uint256 strikeReserves = ERC20(strikeAsset).balanceOf(address(this));
        uint256 underlyingReserves = ERC20(underlyingAsset).balanceOf(address(this));

        uint256 strikeToReceive = weightedBalance.mul(strikeReserves).div(totalLockedWeighted);
        uint256 underlyingToReceive = weightedBalance.mul(underlyingReserves).div(totalLockedWeighted);

        weightedBalances[msg.sender] = weightedBalances[msg.sender].sub(weightedBalance);
        totalLockedWeighted = totalLockedWeighted.sub(weightedBalance);

        require(
            ERC20(strikeAsset).transfer(msg.sender, strikeToReceive),
            "Couldn't transfer back strike tokens to caller"
        );
        if (underlyingReserves > 0) {
            weth.withdraw(underlyingToReceive);
            Address.sendValue(msg.sender, underlyingToReceive);
        }
        emit Withdraw(msg.sender, mintedOptions[msg.sender]);
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }
}
