// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "./PodCall.sol";
import "../interfaces/IWETH.sol";
import "@openzeppelin/contracts/utils/Address.sol";

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
contract WPodCall is PodCall {
    using SafeMath for uint8;
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
        PodCall(
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
     * Locks some amount of the underlying asset (ETH) and writes option tokens.
     *
     * The issued amount ratio is 1:1, i.e., 1 option token for 1 underlying token.
     *
     * This function is meant to be called by ETH token holders wanting
     * to write option tokens.
     *
     * Options can only be minted while the series is NOT expired.
     *
     * @param owner The address that will store at shares. owner will
     * be able to withdraw later on behalf of the sender. It is also important
     * to notice that the options tokens will not be send to owner, but to the msg.sender
     */
    function mintEth(address owner) external payable beforeExpiration {
        uint256 amountOfOptions = msg.value;
        require(amountOfOptions > 0, "Null amount");

        // 1) Calculate strikeToTransfer
        uint256 amountToReceive = amountOfOptions;
        // amountToTransfer = 300
        uint256 ownerShares;

        if (totalShares > 0) {
            // 2) Check current balances
            ownerShares = _calculatedShares(amountToReceive);
            // 4.1) update totalShares
            totalShares = totalShares.add(ownerShares);
            // 4.2) update userMintedOptions
            mintedOptions[owner] = mintedOptions[owner].add(amountToReceive);
            // 4.3) update userWeightBalance
            shares[owner] = shares[owner].add(ownerShares);
        } else {
            ownerShares = amountToReceive;

            shares[owner] = ownerShares;
            mintedOptions[owner] = amountToReceive;
            // totalShares = totalShares
            totalShares = ownerShares;
        }
        weth.deposit{ value: msg.value }();

        _mint(msg.sender, amountOfOptions);
        emit Mint(owner, amountOfOptions);
    }

    /**
     * Unlocks some amount of the underlying token by burning option tokens.
     *
     * This mechanism ensures that users can only redeem tokens they've
     * previously lock into this contract.
     *
     * Options can only be unminted while the series is NOT expired.
     * In case of American options where exercise can happen before the expiration, caller
     * may receive a mix of underlying asset and strike asset.
     *
     * @param amountOfOptions The amount option tokens to be unminted; this will burn
     * same amount of options, releasing in a 1:1 ratio units of underlying asset.
     */
    function unmint(uint256 amountOfOptions) external virtual override beforeExpiration {
        uint256 ownerShares = shares[msg.sender];
        require(ownerShares > 0, "You do not have minted options");

        uint256 ownerMintedOptions = mintedOptions[msg.sender];
        require(amountOfOptions <= ownerMintedOptions, "Exceed address minted options");

        uint256 strikeReserves = ERC20(strikeAsset).balanceOf(address(this));
        uint256 underlyingReserves = ERC20(underlyingAsset).balanceOf(address(this));

        uint256 sharesToDeduce = ownerShares.mul(amountOfOptions).div(ownerMintedOptions);

        uint256 strikeToSend = sharesToDeduce.mul(strikeReserves).div(totalShares);
        uint256 underlyingToSend = sharesToDeduce.mul(underlyingReserves).div(totalShares);

        require(underlyingToSend > 0, "Amount of options should be higher");

        shares[msg.sender] = shares[msg.sender].sub(sharesToDeduce);
        mintedOptions[msg.sender] = mintedOptions[msg.sender].sub(amountOfOptions);
        totalShares = totalShares.sub(sharesToDeduce);

        _burn(msg.sender, amountOfOptions);

        // Unlocks the strike token
        weth.withdraw(underlyingToSend);
        Address.sendValue(msg.sender, underlyingToSend);

        if (strikeReserves > 0) {
            require(strikeToSend > 0, "Amount of options should be higher");
            require(
                ERC20(strikeAsset).transfer(msg.sender, strikeToSend),
                "Couldn't transfer back strike tokens to caller"
            );
        }
        emit Unmint(msg.sender, amountOfOptions);
    }

    /**
     * Allow call token holders to use them to buy some amount of units
     * of the underlying token for the amountOfOptions * strike price units of the
     * strike token.
     *
     * It presumes the caller has already called IERC20.approve() on the
     * strike token contract to move caller funds.
     *
     * During the process:
     *
     * - The amountOfOptions units of underlying tokens are transferred to the
     * caller
     * - The amountOfOptions option tokens are burned.
     * - The amountOfOptions * strikePrice units of strike tokens are transferred into
     * this contract as a payment for the underlying tokens.
     *
     * On American options, this function can only called anytime before expiration.
     * For European options, this function can only be called during the exerciseWindow.
     * Meaning, after expiration and before the end of exercise window.
     *
     * @param amountOfOptions The amount option tokens to be exercised
     */
    function exercise(uint256 amountOfOptions) external override exerciseWindow {
        require(amountOfOptions > 0, "Null amount");
        // Calculate the strike amount equivalent to pay for the underlying requested
        uint256 amountStrikeToReceive = _strikeToTransfer(amountOfOptions);

        // Burn the exercised options
        _burn(msg.sender, amountOfOptions);

        // Retrieve the strike asset from caller
        require(
            ERC20(strikeAsset).transferFrom(msg.sender, address(this), amountStrikeToReceive),
            "Could not transfer underlying tokens from caller"
        );

        weth.withdraw(amountOfOptions);
        Address.sendValue(msg.sender, amountOfOptions);

        emit Exercise(msg.sender, amountOfOptions);
    }

    /**
     * After series expiration, allow addresses who have locked their strike
     * asset tokens to withdraw.
     *
     * If the option has been exercised, the caller will receive a mix of
     * the underlying asset and the strike asset.
     *
     * It is NOT on a first=come=first=serve basis. The exercised options,
     * meaning the strike asset wll be distributed proportionally between sellers.
     *
     */
    function withdraw() external virtual override withdrawWindow {
        uint256 ownerShares = shares[msg.sender];
        require(ownerShares > 0, "You do not have balance to withdraw");

        uint256 strikeReserves = ERC20(strikeAsset).balanceOf(address(this));
        uint256 underlyingReserves = ERC20(underlyingAsset).balanceOf(address(this));

        uint256 strikeToSend = ownerShares.mul(strikeReserves).div(totalShares);
        uint256 underlyingToSend = ownerShares.mul(underlyingReserves).div(totalShares);

        totalShares = totalShares.sub(ownerShares);
        shares[msg.sender] = 0;

        weth.withdraw(underlyingToSend);
        Address.sendValue(msg.sender, underlyingToSend);

        if (strikeToSend > 0) {
            require(
                ERC20(strikeAsset).transfer(msg.sender, strikeToSend),
                "Couldn't transfer back strike tokens to caller"
            );
        }
        emit Withdraw(msg.sender, mintedOptions[msg.sender]);
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }
}
