// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../interfaces/IPodPut.sol";
import "../interfaces/IOptionAMMFactory.sol";
import "../interfaces/IOptionAMMPool.sol";

/**
 * @title PodOption
 * @author Pods Finance
 * @notice Represents a Proxy that can mint and sell on the behalf of a Option Seller,
 * alternatively it can buy to a Option Buyer
 */
contract OptionExchange {
    using SafeMath for uint256;
    IOptionAMMFactory public factory;

    event OptionsBought(
        address indexed buyer,
        address indexed optionAddress,
        uint256 optionsBought,
        address inputToken,
        uint256 inputSold
    );

    event OptionsSold(
        address indexed seller,
        address indexed optionAddress,
        uint256 optionsSold,
        address outputToken,
        uint256 outputBought
    );

    event LiquidityAdded(
        address indexed staker,
        address indexed optionAddress,
        uint256 amountOptions,
        address token,
        uint256 tokenAmount
    );

    constructor(IOptionAMMFactory _factory) public {
        factory = _factory;
    }

    modifier withinDeadline(uint256 deadline) {
        require(deadline > block.timestamp, "OptionExchange/deadline-expired");
        _;
    }

    /**
     * @notice Mint options
     * @dev Mints an amount of options and return to caller
     *
     * @param option The option contract to mint
     * @param optionAmount Amount of options to mint
     */
    function mint(IPodPut option, uint256 optionAmount) external {
        _mint(option, optionAmount);
        require(option.transfer(msg.sender, optionAmount), "OptionExchange/could-not-transfer-options-back-to-caller");
    }

    /**
     * @notice Mint and sell options
     * @dev Mints an amount of options and sell it in pool
     *
     * @param option The option contract to mint
     * @param optionAmount Amount of options to mint
     * @param token The token which the premium will be paid
     * @param minTokenAmount Minimum amount of output tokens accepted
     * @param deadline The deadline in unix-timestamp that limits the transaction from happening
     * @param sigma The initial volatility guess
     */
    function mintAndSellOptions(
        IPodPut option,
        uint256 optionAmount,
        address token,
        uint256 minTokenAmount,
        uint256 deadline,
        uint256 sigma
    ) external withinDeadline(deadline) {
        IOptionAMMPool pool = _getPool(option);

        _mint(option, optionAmount);

        // Approving Option transfer to Exchange
        option.approve(address(pool), optionAmount);

        uint256 tokensBought = pool.tradeExactAInput(optionAmount, minTokenAmount, msg.sender, sigma);

        emit OptionsSold(msg.sender, address(option), optionAmount, token, tokensBought);
    }

    /**
     * @notice Mint and add liquidity
     * @dev Mint options and add them as liquidity providing
     *
     * @param option The option contract to mint
     * @param optionAmount Amount of options to mint
     * @param token The output token which the premium will be paid
     * @param tokenAmount Amount of output tokens accepted
     */
    function mintAndAddLiquidity(
        IPodPut option,
        uint256 optionAmount,
        address token,
        uint256 tokenAmount
    ) external {
        IOptionAMMPool pool = _getPool(option);

        _mint(option, optionAmount);

        require(
            IERC20(token).transferFrom(msg.sender, address(this), tokenAmount),
            "OptionExchange/could-not-transfer-token-from-caller"
        );

        // Approving Option transfer to pool
        option.approve(address(pool), optionAmount);

        // Approving Token transfer to pool
        IERC20(token).approve(address(pool), tokenAmount);

        pool.addLiquidity(optionAmount, tokenAmount, msg.sender);

        emit LiquidityAdded(msg.sender, address(option), optionAmount, token, tokenAmount);
    }

    /**
     * @notice Buy exact amount of options
     * @dev Buys an amount of options from pool
     *
     * @param option The option contract to buy
     * @param optionAmount Amount of options to buy
     * @param token The token spent to buy options
     * @param maxTokenAmount Max amount of input tokens sold
     * @param deadline The deadline in unix-timestamp that limits the transaction from happening
     * @param sigma The initial volatility guess
     */
    function buyExactOptions(
        IPodPut option,
        uint256 optionAmount,
        address token,
        uint256 maxTokenAmount,
        uint256 deadline,
        uint256 sigma
    ) external withinDeadline(deadline) {
        IOptionAMMPool pool = _getPool(option);

        // Take input amount from caller
        require(
            IERC20(token).transferFrom(msg.sender, address(this), maxTokenAmount),
            "OptionExchange/could-not-transfer-tokens-from-caller"
        );

        // Approve pool usage
        IERC20(token).approve(address(pool), maxTokenAmount);

        uint256 tokensSold = pool.tradeExactAOutput(optionAmount, maxTokenAmount, msg.sender, sigma);

        // Transfer back unused funds
        if (tokensSold < maxTokenAmount) {
            require(
                IERC20(token).transfer(msg.sender, maxTokenAmount.sub(tokensSold)),
                "OptionExchange/could-not-transfer-tokens-back-to-caller"
            );
        }

        emit OptionsBought(msg.sender, address(option), optionAmount, token, tokensSold);
    }

    /**
     * @notice Buy estimated amount of options
     * @dev Buys an estimated amount of options from pool
     *
     * @param option The option contract to buy
     * @param minOptionAmount Min amount of options bought
     * @param token The token spent to buy options
     * @param tokenAmount The exact amount of input tokens sold
     * @param deadline The deadline in unix-timestamp that limits the transaction from happening
     */
    function buyOptionsWithExactTokens(
        IPodPut option,
        uint256 minOptionAmount,
        address token,
        uint256 tokenAmount,
        uint256 deadline,
        uint256 sigma
    ) external withinDeadline(deadline) {
        IOptionAMMPool pool = _getPool(option);

        // Take input amount from caller
        require(
            IERC20(token).transferFrom(msg.sender, address(this), tokenAmount),
            "OptionExchange/could-not-transfer-tokens-from-caller"
        );

        // Approve pool usage
        IERC20(token).approve(address(pool), tokenAmount);

        uint256 optionsBought = pool.tradeExactBInput(tokenAmount, minOptionAmount, msg.sender, sigma);

        emit OptionsBought(msg.sender, address(option), optionsBought, token, tokenAmount);
    }

    /**
     * @dev Mints an amount of tokens collecting the strike tokens from the caller
     *
     * @param option The option contract to mint
     * @param amount The amount of options to mint
     */
    function _mint(IPodPut option, uint256 amount) internal {
        IERC20 strikeAsset = IERC20(option.strikeAsset());
        uint256 strikeToTransfer = option.strikeToTransfer(amount);

        require(
            strikeAsset.transferFrom(msg.sender, address(this), strikeToTransfer),
            "OptionExchange/could-not-transfer-strike-from-caller"
        );

        // Approving Strike transfer to Option
        strikeAsset.approve(address(option), strikeToTransfer);
        option.mint(amount, msg.sender);
    }

    /**
     * @dev Returns the AMM Exchange associated with the option
     *
     * @param option The option to search for
     * @return IOptionAMMPool
     */
    function _getPool(IPodPut option) internal view returns (IOptionAMMPool) {
        address exchangeOptionAddress = factory.getPool(address(option));
        require(exchangeOptionAddress != address(0), "OptionExchange/pool-not-found");
        return IOptionAMMPool(exchangeOptionAddress);
    }
}
