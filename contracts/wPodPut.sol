// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "./PodPut.sol";
import "./interfaces/IUniswapV1.sol";
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
 * Put token holders may call exchange() until the expiration date, to
 * exercise their option, which in turn:
 *
 * - Will sell 1 ETH for 300 USDC (the strike price) each.
 * - Will burn the corresponding amount of put tokens.
 */
contract wPodPut is PodPut {
    IWETH public weth;

    constructor(
        string memory _name,
        string memory _symbol,
        PodOption.OptionType _optionType,
        address _underlyingAsset,
        address _strikeAsset,
        uint256 _strikePrice,
        uint256 _expirationBlockNumber,
        address _uniswapFactory
    )
        public
        PodPut(
            _name,
            _symbol,
            _optionType,
            _underlyingAsset,
            _strikeAsset,
            _strikePrice,
            _expirationBlockNumber,
            _uniswapFactory
        )
    {
        weth = IWETH(_underlyingAsset);
    }

    event Received(address sender, uint256 value);

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
    function exchangeEth() external payable beforeExpiration {
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
        emit Exchange(msg.sender, amount);
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
        uint256 amount = lockedBalance[msg.sender];
        require(amount > 0, "You do not have balance to withdraw");

        // Calculates how many underlying/strike tokens the caller
        // will get back
        uint256 currentStrikeBalance = ERC20(strikeAsset).balanceOf(address(this));
        uint256 strikeToReceive = _strikeToTransfer(amount);
        uint256 underlyingToReceive = 0;
        if (strikeToReceive > currentStrikeBalance) {
            uint256 remainingStrikeAmount = strikeToReceive.sub(currentStrikeBalance);
            strikeToReceive = currentStrikeBalance;

            underlyingToReceive = _underlyingToTransfer(remainingStrikeAmount);
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
            weth.withdraw(underlyingToReceive);
            Address.sendValue(msg.sender, underlyingToReceive);
        }
        emit Withdraw(msg.sender, amount);
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }
}
