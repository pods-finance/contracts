// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./PodCall.sol";
import "../interfaces/IWETH.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title WPodCall
 * @author Pods Finance
 *
 * @notice Represents a tokenized European call option series for some long/short token pair.
 *
 * @dev Call options represents the right, not the obligation to buy the underlying asset
 * for strike price units of the strike asset.
 *
 * There are four main actions that can be done with an option:
 *
 *
 * Sellers can mint fungible call option tokens by locking 1:1 units
 * of underlying asset until expiration. Buyers can exercise their call, meaning
 * buying the locked underlying asset for strike price units of strike asset.
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
 * - Will give back its amount of collateral locked. That could be o mix of
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
     * @notice Locks underlying asset (ETH) and write option tokens.
     *
     * @dev The issued amount ratio is 1:1, i.e., 1 option token for 1 underlying token.
     *
     * This function is meant to be called by underlying token (ETH) holders wanting
     * to write option tokens. Calling it will lock `amountOfOptions` units of
     * `underlyingToken` into this contract
     *
     * Options can only be minted while the series is NOT expired.
     *
     * It is also important to notice that options will be sent back
     * to `msg.sender` and not the `owner`. This behavior is designed to allow
     * proxy contracts to mint on others behalf
     *
     * @param owner Which address will be the owner of the options
     */
    function mintEth(address owner) external payable beforeExpiration {
        uint256 amountOfOptions = msg.value;
        require(amountOfOptions > 0, "Null amount");

        if (totalShares > 0) {
            uint256 ownerShares = _calculatedShares(amountOfOptions);

            shares[owner] = shares[owner].add(ownerShares);
            mintedOptions[owner] = mintedOptions[owner].add(amountOfOptions);
            totalShares = totalShares.add(ownerShares);
        } else {
            shares[owner] = amountOfOptions;
            mintedOptions[owner] = amountOfOptions;
            totalShares = amountOfOptions;
        }

        weth.deposit{ value: msg.value }();

        _mint(msg.sender, amountOfOptions);
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
     * @notice Allow Call token holders to use them to buy some amount of ETH
     * for the amountOfOptions * strike price units of the strike token.
     *
     * @dev It presumes the caller has already called IERC20.approve() on the
     * strike token contract to move caller funds.
     *
     * During the process:
     *
     * - The amountOfOptions units of underlying tokens are transferred to the caller
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
     * @notice After series expiration, allow minters who have locked their
     * underlying asset tokens to withdraw them proportionally to their minted options.
     *
     * @dev If assets had been exercised during the option series the minter may withdraw
     * the exercised assets or a combination of exercised and underlying asset tokens.
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
