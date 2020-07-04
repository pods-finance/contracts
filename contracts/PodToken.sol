// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "./OptionCore.sol";
import "./interfaces/IUniswapV1.sol";

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
 * - Will burn the corresponding amounty of put tokens.
 */
contract PodToken is OptionCore {
    using SafeMath for uint8;

    constructor(
        string memory _name,
        string memory _symbol,
        OptionCore.OptionType _optionType,
        address _underlyingAsset,
        address _strikeAsset,
        uint256 _strikePrice,
        uint256 _expirationBlockNumber,
        address _uniswapFactory
    )
        public
        OptionCore(
            _name,
            _symbol,
            _optionType,
            _underlyingAsset,
            _strikeAsset,
            _strikePrice,
            _expirationBlockNumber,
            _uniswapFactory
        )
    {}

    /** Events */
    event Mint(address indexed seller, uint256 amount);
    event Burn(address indexed seller, uint256 amount);
    event Exchange(address indexed buyer, uint256 amount);
    event Withdraw(address indexed seller, uint256 amount);
    event SellUniswap(address indexed seller, uint256 amount);

    /**
     * @notice Gets the amount of minted options given amount of strikeAsset`.
     * @param strikeAmount of options that protect 1:1 underlying asset.
     * @return optionsAmount amount of strike asset.
     */
    function amountOfMintedOptions(uint256 strikeAmount) external view returns (uint256 optionsAmount) {
        optionsAmount = _underlyingToTransfer(strikeAmount);
    }

    /**
     * @notice Gets the amount of strikeAsset necessary to mint a given amount of options`.
     * @param amount of options that protect 1:1 underlying asset.
     * @return strikeAmount amount of strike asset.
     */
    function strikeToTransfer(uint256 amount) external view returns (uint256 strikeAmount) {
        strikeAmount = _strikeToTransfer(amount);
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
     */
    function mint(uint256 amount) external beforeExpiration {
        lockedBalance[msg.sender] = lockedBalance[msg.sender].add(amount);
        _mint(msg.sender, amount);

        uint256 amountStrikeToTransfer = _strikeToTransfer(amount);

        require(amountStrikeToTransfer > 0, "Amount too low");
        require(
            ERC20(strikeAsset).transferFrom(msg.sender, address(this), amountStrikeToTransfer),
            "Could not transfer strike tokens from caller"
        );
        emit Mint(msg.sender, amount);
    }

    /**
     * @notice Mint new option and sell it directly to Uniswap
     * @param amount The amount option tokens to be issued
     * @param minTokensBought Minimium amount of tokens that could be acceptable bought
     * @param tokenOutput Address of the ERC20 that sender wants to receive option premium
     */
    function mintAndSell(
        uint256 amount,
        uint256 minTokensBought,
        address tokenOutput
    ) external beforeExpiration returns (uint256) {
        lockedBalance[msg.sender] = lockedBalance[msg.sender].add(amount);
        _mint(address(this), amount);

        uint256 amountStrikeToTransfer = _strikeToTransfer(amount);

        require(amountStrikeToTransfer > 0, "Amount too low");
        require(
            ERC20(strikeAsset).transferFrom(msg.sender, address(this), amountStrikeToTransfer),
            "Could not transfer strike tokens from caller"
        );

        IUniswapFactory uniswapFactory = IUniswapFactory(uniswapFactoryAddress);

        address exchangeOptionAddress = uniswapFactory.getExchange(address(this));
        require(exchangeOptionAddress != address(0), "Exchange not found");
        require(this.approve(exchangeOptionAddress, amount), "Could not approve exchange transfer");

        IUniswapExchange exchangeOption = IUniswapExchange(exchangeOptionAddress);

        uint256 minEthBought = 1;
        uint256 deadline = now + 3000;

        try
            exchangeOption.tokenToTokenTransferInput(
                amount,
                minTokensBought,
                minEthBought,
                deadline,
                msg.sender,
                tokenOutput
            )
        returns (uint256 tokenBought) {
            emit Mint(msg.sender, amount);
            emit SellUniswap(msg.sender, amount);
            return tokenBought;
        } catch {
            revert("Uniswap trade fail");
        }
    }

    /**
     * Unlocks some amount of the strike token by burning option tokens.
     *
     * This mechanism ensures that users can only redeem tokens they've
     * previously lock into this contract.
     *
     * Options can only be burned while the series is NOT expired.
     */
    function burn(uint256 amount) external beforeExpiration {
        require(amount <= lockedBalance[msg.sender], "Not enough underlying balance");

        // Burn option tokens
        lockedBalance[msg.sender] = lockedBalance[msg.sender].sub(amount);
        _burn(msg.sender, amount);

        uint256 amountStrikeToTransfer = _strikeToTransfer(amount);

        // Unlocks the strike token
        require(
            ERC20(strikeAsset).transfer(msg.sender, amountStrikeToTransfer),
            "Could not transfer back strike tokens to caller"
        );
        emit Burn(msg.sender, amount);
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
     */
    function exchange(uint256 amount) external beforeExpiration {
        require(amount > 0, "Null amount");
        require(
            ERC20(underlyingAsset).transferFrom(msg.sender, address(this), amount),
            "Could not transfer underlying tokens from caller"
        );
        // Gets the payment from the caller by transfering them
        // to this contract
        uint256 amountStrikeToTransfer = _strikeToTransfer(amount);
        // Transfers the strike tokens back in exchange
        _burn(msg.sender, amount);
        require(amountStrikeToTransfer > 0, "Amount too low");
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
    function withdraw() external afterExpiration {
        uint256 amount = lockedBalance[msg.sender];
        require(amount > 0, "You do not have balance to withdraw");
        _redeem(amount);
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

    function _redeem(uint256 amount) internal {
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
        // require(amount <= lockedBalance[msg.sender]), "Withdraw amount exceeds lockedBalance")
        // We need to check if the person has enough lockedBalance

        // Unlocks the underlying token
        lockedBalance[msg.sender] = lockedBalance[msg.sender].sub(amount);
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
}
