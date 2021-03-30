// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "../interfaces/IConfigurationManager.sol";
import "../interfaces/IPodOption.sol";
import "../interfaces/IOptionAMMFactory.sol";
import "../interfaces/IOptionAMMPool.sol";

/**
 * @title PodOption
 * @author Pods Finance
 * @notice Represents a Proxy that can perform a set of operations on the behalf of an user
 */
contract OptionHelper {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /**
     * @dev store globally accessed configurations
     */
    IConfigurationManager private _configurationManager;

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
        uint256 outputReceived
    );

    event OptionsMintedAndSold(
        address indexed seller,
        address indexed optionAddress,
        uint256 optionsMintedAndSold,
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

    constructor(address configurationManager) public {
        require(Address.isContract(configurationManager), "OptionHelper: Configuration Manager is not a contract");
        _configurationManager = IConfigurationManager(configurationManager);
    }

    modifier withinDeadline(uint256 deadline) {
        require(deadline > block.timestamp, "OptionHelper: deadline expired");
        _;
    }

    /**
     * @notice Mint options
     * @dev Mints an amount of options and return to caller
     *
     * @param option The option contract to mint
     * @param optionAmount Amount of options to mint
     */
    function mint(IPodOption option, uint256 optionAmount) external {
        _mint(option, optionAmount);

        // Transfers back the minted options
        IERC20(address(option)).safeTransfer(msg.sender, optionAmount);
    }

    /**
     * @notice Mint and sell options
     * @dev Mints an amount of options and sell it in pool
     *
     * @param option The option contract to mint
     * @param optionAmount Amount of options to mint
     * @param minTokenAmount Minimum amount of output tokens accepted
     * @param deadline The deadline in unix-timestamp that limits the transaction from happening
     * @param sigma The initial volatility guess
     */
    function mintAndSellOptions(
        IPodOption option,
        uint256 optionAmount,
        uint256 minTokenAmount,
        uint256 deadline,
        uint256 sigma
    ) external withinDeadline(deadline) {
        IOptionAMMPool pool = _getPool(option);

        _mint(option, optionAmount);

        // Approve pool transfer
        IERC20(address(option)).safeApprove(address(pool), optionAmount);

        // Sells options to pool
        uint256 tokensBought = pool.tradeExactAInput(optionAmount, minTokenAmount, msg.sender, sigma);

        emit OptionsMintedAndSold(msg.sender, address(option), optionAmount, pool.tokenB(), tokensBought);
    }

    /**
     * @notice Mint and add liquidity
     * @dev Mint options and add them as liquidity providing
     *
     * @param option The option contract to mint
     * @param optionAmount Amount of options to mint
     * @param tokenAmount Amount of output tokens accepted
     */
    function mintAndAddLiquidity(
        IPodOption option,
        uint256 optionAmount,
        uint256 tokenAmount
    ) external {
        IOptionAMMPool pool = _getPool(option);
        IERC20 tokenB = IERC20(pool.tokenB());

        _mint(option, optionAmount);

        // Take stable token from caller
        tokenB.safeTransferFrom(msg.sender, address(this), tokenAmount);

        // Approve pool transfer
        IERC20(address(option)).safeApprove(address(pool), optionAmount);
        tokenB.safeApprove(address(pool), tokenAmount);

        // Adds options and tokens to pool as liquidity
        pool.addLiquidity(optionAmount, tokenAmount, msg.sender);

        emit LiquidityAdded(msg.sender, address(option), optionAmount, pool.tokenB(), tokenAmount);
    }

    /**
     * @notice Sell exact amount of options
     * @dev Sell an amount of options from pool
     *
     * @param option The option contract to sell
     * @param optionAmount Amount of options to sell
     * @param minTokenReceived Min amount of input tokens to receive
     * @param deadline The deadline in unix-timestamp that limits the transaction from happening
     * @param sigmaInitialGuess The initial sigma guess (IV)
     */
    function sellExactOptions(
        IPodOption option,
        uint256 optionAmount,
        uint256 minTokenReceived,
        uint256 deadline,
        uint256 sigmaInitialGuess
    ) external withinDeadline(deadline) {
        IOptionAMMPool pool = _getPool(option);
        IERC20 tokenA = IERC20(pool.tokenA());

        // Take input amount from caller
        tokenA.safeTransferFrom(msg.sender, address(this), optionAmount);

        // Approve pool transfer
        tokenA.safeApprove(address(pool), optionAmount);

        // Buys options from pool
        uint256 tokenAmountReceived = pool.tradeExactAInput(
            optionAmount,
            minTokenReceived,
            msg.sender,
            sigmaInitialGuess
        );

        emit OptionsSold(msg.sender, address(option), optionAmount, pool.tokenB(), tokenAmountReceived);
    }

    /**
     * @notice Sell estimated amount of options
     * @dev Sell an estimated amount of options to the pool
     *
     * @param option The option contract to sell
     * @param maxOptionAmount max Amount of options to sell
     * @param exactTokenReceived exact amount of input tokens to receive
     * @param deadline The deadline in unix-timestamp that limits the transaction from happening
     * @param sigmaInitialGuess The initial sigma guess (IV)
     */
    function sellOptionsAndReceiveExactTokens(
        IPodOption option,
        uint256 maxOptionAmount,
        uint256 exactTokenReceived,
        uint256 deadline,
        uint256 sigmaInitialGuess
    ) external withinDeadline(deadline) {
        IOptionAMMPool pool = _getPool(option);
        IERC20 tokenA = IERC20(pool.tokenA());

        // Take input amount from caller
        tokenA.safeTransferFrom(msg.sender, address(this), maxOptionAmount);

        // Approve pool transfer
        tokenA.safeApprove(address(pool), maxOptionAmount);

        // Buys options from pool
        uint256 optionsSold = pool.tradeExactBOutput(
            exactTokenReceived,
            maxOptionAmount,
            msg.sender,
            sigmaInitialGuess
        );

        uint256 unusedFunds = maxOptionAmount.sub(optionsSold);

        // Reset allowance
        tokenA.safeApprove(address(pool), 0);

        // Transfer back unused funds
        if (unusedFunds > 0) {
            tokenA.safeTransfer(msg.sender, unusedFunds);
        }

        emit OptionsSold(msg.sender, address(option), optionsSold, pool.tokenB(), exactTokenReceived);
    }

    /**
     * @notice Buy exact amount of options
     * @dev Buys an amount of options from pool
     *
     * @param option The option contract to buy
     * @param optionAmount Amount of options to buy
     * @param maxTokenAmount Max amount of input tokens sold
     * @param deadline The deadline in unix-timestamp that limits the transaction from happening
     * @param sigma The initial volatility guess
     */
    function buyExactOptions(
        IPodOption option,
        uint256 optionAmount,
        uint256 maxTokenAmount,
        uint256 deadline,
        uint256 sigma
    ) external withinDeadline(deadline) {
        IOptionAMMPool pool = _getPool(option);
        IERC20 tokenB = IERC20(pool.tokenB());

        // Take input amount from caller
        tokenB.safeTransferFrom(msg.sender, address(this), maxTokenAmount);

        // Approve pool transfer
        tokenB.safeApprove(address(pool), maxTokenAmount);

        // Buys options from pool
        uint256 tokensSold = pool.tradeExactAOutput(optionAmount, maxTokenAmount, msg.sender, sigma);
        uint256 unusedFunds = maxTokenAmount.sub(tokensSold);

        // Reset allowance
        tokenB.safeApprove(address(pool), 0);

        // Transfer back unused funds
        if (unusedFunds > 0) {
            tokenB.safeTransfer(msg.sender, unusedFunds);
        }

        emit OptionsBought(msg.sender, address(option), optionAmount, pool.tokenB(), tokensSold);
    }

    /**
     * @notice Buy estimated amount of options
     * @dev Buys an estimated amount of options from pool
     *
     * @param option The option contract to buy
     * @param minOptionAmount Min amount of options bought
     * @param tokenAmount The exact amount of input tokens sold
     * @param deadline The deadline in unix-timestamp that limits the transaction from happening
     */
    function buyOptionsWithExactTokens(
        IPodOption option,
        uint256 minOptionAmount,
        uint256 tokenAmount,
        uint256 deadline,
        uint256 sigma
    ) external withinDeadline(deadline) {
        IOptionAMMPool pool = _getPool(option);
        IERC20 tokenB = IERC20(pool.tokenB());

        // Take input amount from caller
        tokenB.safeTransferFrom(msg.sender, address(this), tokenAmount);

        // Approve pool transfer
        tokenB.safeApprove(address(pool), tokenAmount);

        // Buys options from pool
        uint256 optionsBought = pool.tradeExactBInput(tokenAmount, minOptionAmount, msg.sender, sigma);

        emit OptionsBought(msg.sender, address(option), optionsBought, pool.tokenB(), tokenAmount);
    }

    /**
     * @dev Mints an amount of tokens collecting the strike tokens from the caller
     *
     * @param option The option contract to mint
     * @param amount The amount of options to mint
     */
    function _mint(IPodOption option, uint256 amount) internal {
        if (option.optionType() == IPodOption.OptionType.PUT) {
            IERC20 strikeAsset = IERC20(option.strikeAsset());
            uint256 strikeToTransfer = option.strikeToTransfer(amount);

            // Take strike asset from caller
            strikeAsset.safeTransferFrom(msg.sender, address(this), strikeToTransfer);

            // Approving strike asset transfer to Option
            strikeAsset.safeApprove(address(option), strikeToTransfer);

            option.mint(amount, msg.sender);
        } else if (option.optionType() == IPodOption.OptionType.CALL) {
            IERC20 underlyingAsset = IERC20(option.underlyingAsset());

            // Take underlying asset from caller
            underlyingAsset.safeTransferFrom(msg.sender, address(this), amount);

            // Approving underlying asset to Option
            underlyingAsset.safeApprove(address(option), amount);

            option.mint(amount, msg.sender);
        }
    }

    /**
     * @dev Returns the AMM Pool associated with the option
     *
     * @param option The option to search for
     * @return IOptionAMMPool
     */
    function _getPool(IPodOption option) internal view returns (IOptionAMMPool) {
        IOptionAMMFactory factory = IOptionAMMFactory(_configurationManager.getAMMFactory());
        address exchangeOptionAddress = factory.getPool(address(option));
        require(exchangeOptionAddress != address(0), "OptionHelper: pool not found");
        return IOptionAMMPool(exchangeOptionAddress);
    }
}
