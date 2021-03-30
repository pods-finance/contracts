// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "../lib/RequiredDecimals.sol";
import "../interfaces/IAMM.sol";

/**
 * Represents a generalized contract for a single-sided AMM pair.
 *
 * That means is possible to add and remove liquidity in any proportion
 * at any time, even 0 in one of the sides.
 *
 * The AMM is constituted by 3 core functions: Add Liquidity, Remove liquidity and Trade.
 *
 * There are 4 possible trade types between the token pair (tokenA and tokenB):
 *
 * - ExactAInput:
 *     tokenA as an exact Input, meaning that the output tokenB is variable.
 *     it is important to have a slippage control of the minimum acceptable amount of tokenB in return
 * - ExactAOutput:
 *     tokenA as an exact Output, meaning that the input tokenB is variable.
 *     it is important to have a slippage control of the maximum acceptable amount of tokenB sent
 * - ExactBInput:
 *     tokenB as an exact Input, meaning that the output tokenA is variable.
 *     it is important to have a slippage control of the minimum acceptable amount of tokenA in return
 * - ExactBOutput:
 *     tokenB as an exact Output, meaning that the input tokenA is variable.
 *     it is important to have a slippage control of the maximum acceptable amount of tokenA sent
 *
 * Several functions are provided as virtual and must be overridden by the inheritor.
 *
 * - _getABPrice:
 *     function that will return the tokenA:tokenB price relation.
 *     How many units of tokenB in order to traded for 1 unit of tokenA.
 *     This price is represented in the same tokenB number of decimals.
 * - _onAddLiquidity:
 *     Executed after adding liquidity. Usually used for handling fees
 * - _onRemoveLiquidity:
 *     Executed after removing liquidity. Usually used for handling fees
 *
 *  Also, for which TradeType (E.g: ExactAInput) there are more two functions to override:

 * _getTradeDetails[$TradeType]:
 *   This function is responsible to return the TradeDetails struct, that contains basically the amount
 *   of the other token depending on the trade type. (E.g: ExactAInput => The TradeDetails will return the
 *   amount of B output).
 * _onTrade[$TradeType]:
 *    function that will be executed after UserDepositSnapshot updates and before
 *    token transfers. Usually used for handling fees and updating state at the inheritor.
 *
 */

abstract contract AMM is IAMM, RequiredDecimals {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /**
     * @dev The initial value for deposit factor (Fimp)
     */
    uint256 public constant INITIAL_FIMP = 10**27;

    /**
     * @notice The Fimp's precision (aka number of decimals)
     */
    uint256 public constant FIMP_DECIMALS = 27;

    /**
     * @notice The percent's precision
     */
    uint256 public constant PERCENT_PRECISION = 100;

    /**
     * @dev Address of the token A
     */
    address private _tokenA;

    /**
     * @dev Address of the token B
     */
    address private _tokenB;

    /**
     * @dev Token A number of decimals
     */
    uint8 private _tokenADecimals;

    /**
     * @dev Token B number of decimals
     */
    uint8 private _tokenBDecimals;

    /**
     * @notice The total balance of token A in the pool not counting the amortization
     */
    uint256 public deamortizedTokenABalance;

    /**
     * @notice The total balance of token B in the pool not counting the amortization
     */
    uint256 public deamortizedTokenBBalance;

    /**
     * @notice It contains the token A original balance, token B original balance,
     * and the Open Value Factor (Fimp) at the time of the deposit.
     */
    struct UserDepositSnapshot {
        uint256 tokenABalance;
        uint256 tokenBBalance;
        uint256 fImp;
    }

    struct Mult {
        uint256 AA; // How much A Im getting for rescuing one A that i've deposited
        uint256 AB; // How much B Im getting for rescuing one A that i've deposited
        uint256 BA; // How much A Im getting for rescuing one B that i've deposited
        uint256 BB; // How much B Im getting for rescuing one B that i've deposited
    }

    struct TradeDetails {
        uint256 amount;
        uint256 feesTokenA;
        uint256 feesTokenB;
        bytes params;
    }
    /**
     * @notice Tracks the UserDepositSnapshot struct of each user.
     * It contains the token A original balance, token B original balance,
     * and the Open Value Factor (Fimp) at the time of the deposit.
     */
    mapping(address => UserDepositSnapshot) public userSnapshots;

    /** Events */
    event AddLiquidity(address indexed caller, address indexed owner, uint256 amountA, uint256 amountB);
    event RemoveLiquidity(address indexed caller, uint256 amountA, uint256 amountB);
    event TradeExactAInput(address indexed caller, address indexed owner, uint256 exactAmountAIn, uint256 amountBOut);
    event TradeExactBInput(address indexed caller, address indexed owner, uint256 exactAmountBIn, uint256 amountAOut);
    event TradeExactAOutput(address indexed caller, address indexed owner, uint256 amountBIn, uint256 exactAmountAOut);
    event TradeExactBOutput(address indexed caller, address indexed owner, uint256 amountAIn, uint256 exactAmountBOut);

    constructor(address tokenA, address tokenB) public {
        require(Address.isContract(tokenA), "AMM: token a is not a contract");
        require(Address.isContract(tokenB), "AMM: token b is not a contract");
        require(tokenA != tokenB, "AMM: tokens must differ");

        _tokenA = tokenA;
        _tokenB = tokenB;

        _tokenADecimals = tryDecimals(IERC20(tokenA));
        _tokenBDecimals = tryDecimals(IERC20(tokenB));
    }

    /**
     * @dev Returns the address for tokenA
     */
    function tokenA() public override view returns (address) {
        return _tokenA;
    }

    /**
     * @dev Returns the address for tokenB
     */
    function tokenB() public override view returns (address) {
        return _tokenB;
    }

    /**
     * @dev Returns the decimals for tokenA
     */
    function tokenADecimals() public override view returns (uint8) {
        return _tokenADecimals;
    }

    /**
     * @dev Returns the decimals for tokenB
     */
    function tokenBDecimals() public override view returns (uint8) {
        return _tokenBDecimals;
    }

    /**
     * @notice getPoolBalances external function that returns the current pool balance of token A and token B
     *
     * @return totalTokenA balanceOf this contract of token A
     * @return totalTokenB balanceOf this contract of token B
     */
    function getPoolBalances() external view returns (uint256 totalTokenA, uint256 totalTokenB) {
        return _getPoolBalances();
    }

    /**
     * @notice getUserDepositSnapshot external function that User original balance of token A,
     * token B and the Opening Value * * Factor (Fimp) at the moment of the liquidity added
     *
     * @param user address to check the balance info
     *
     * @return tokenAOriginalBalance balance of token A by the moment of deposit
     * @return tokenBOriginalBalance balance of token B by the moment of deposit
     * @return fImpUser value of the Opening Value Factor by the moment of the deposit
     */
    function getUserDepositSnapshot(address user)
        external
        view
        returns (
            uint256 tokenAOriginalBalance,
            uint256 tokenBOriginalBalance,
            uint256 fImpUser
        )
    {
        return _getUserDepositSnapshot(user);
    }

    /**
     * @notice getRemoveLiquidityAmounts external function that returns the available for rescue
     * amounts of token A, and token B based on the original position
     *
     * @param percentA percent of exposition of Token A to be removed
     * @param percentB percent of exposition of Token B to be removed
     * @param user Opening Value Factor by the moment of the deposit
     *
     * @return withdrawAmountA amount of token A that will be rescued
     * @return withdrawAmountB amount of token B that will be rescued
     */
    function getRemoveLiquidityAmounts(
        uint256 percentA,
        uint256 percentB,
        address user
    ) external view returns (uint256 withdrawAmountA, uint256 withdrawAmountB) {
        return _getRemoveLiquidityAmounts(percentA, percentB, user);
    }

    /**
     * @notice getMaxRemoveLiquidityAmounts external function that returns the max available for rescue
     * of token A and token B based on the user total balance A, balance B and the Fimp original
     *
     * @param user address to check the balance info
     *
     * @return maxWithdrawAmountA max amount of token A the will be rescued
     * @return maxWithdrawAmountB max amount of token B the will be rescued
     */
    function getMaxRemoveLiquidityAmounts(address user)
        external
        view
        returns (uint256 maxWithdrawAmountA, uint256 maxWithdrawAmountB)
    {
        (maxWithdrawAmountA, maxWithdrawAmountB) = _getRemoveLiquidityAmounts(100, 100, user);
        return (maxWithdrawAmountA, maxWithdrawAmountB);
    }

    /**
     * @notice _addLiquidity in any proportion of tokenA or tokenB
     *
     * @dev The inheritor contract should implement _getABPrice and _onAddLiquidity functions
     *
     * @param amountOfA amount of TokenA to add
     * @param amountOfB amount of TokenB to add
     * @param owner address of the account that will have ownership of the liquidity
     */
    function _addLiquidity(
        uint256 amountOfA,
        uint256 amountOfB,
        address owner
    ) internal {
        _isRecipient(owner);
        // Get Pool Balances
        (uint256 totalTokenA, uint256 totalTokenB) = _getPoolBalances();

        bool hasNoLiquidity = deamortizedTokenABalance == 0 && deamortizedTokenBBalance == 0;
        uint256 fImpOpening;
        uint256 userAmountToStoreTokenA = amountOfA;
        uint256 userAmountToStoreTokenB = amountOfB;

        if (hasNoLiquidity) {
            // In the first liquidity, is necessary add both tokens
            bool bothTokensHigherThanZero = amountOfA > 0 && amountOfB > 0;
            require(bothTokensHigherThanZero, "AMM: invalid first liquidity");

            fImpOpening = INITIAL_FIMP;

            deamortizedTokenABalance = amountOfA;
            deamortizedTokenBBalance = amountOfB;
        } else {
            // Get ABPrice
            uint256 ABPrice = _getABPrice();
            require(ABPrice > 0, "AMM: option price zero");

            // Calculate the Pool's Value Factor (Fimp)
            fImpOpening = _getFImpOpening(
                totalTokenA,
                totalTokenB,
                ABPrice,
                deamortizedTokenABalance,
                deamortizedTokenBBalance
            );

            (userAmountToStoreTokenA, userAmountToStoreTokenB) = _getUserBalanceToStore(
                amountOfA,
                amountOfB,
                fImpOpening,
                userSnapshots[owner]
            );

            // Update Deamortized Balance of the pool for each token;
            deamortizedTokenABalance = deamortizedTokenABalance.add(amountOfA.mul(10**FIMP_DECIMALS).div(fImpOpening));
            deamortizedTokenBBalance = deamortizedTokenBBalance.add(amountOfB.mul(10**FIMP_DECIMALS).div(fImpOpening));
        }

        // Update the User Balances for each token and with the Pool Factor previously calculated
        UserDepositSnapshot memory userDepositSnapshot = UserDepositSnapshot(
            userAmountToStoreTokenA,
            userAmountToStoreTokenB,
            fImpOpening
        );
        userSnapshots[owner] = userDepositSnapshot;

        _onAddLiquidity(userSnapshots[owner], owner);

        // Update Total Balance of the pool for each token
        if (amountOfA > 0) {
            IERC20(_tokenA).safeTransferFrom(msg.sender, address(this), amountOfA);
        }

        if (amountOfB > 0) {
            IERC20(_tokenB).safeTransferFrom(msg.sender, address(this), amountOfB);
        }

        emit AddLiquidity(msg.sender, owner, amountOfA, amountOfB);
    }

    /**
     * @notice _removeLiquidity in any proportion of tokenA or tokenB
     * @dev The inheritor contract should implement _getABPrice and _onRemoveLiquidity functions
     *
     * @param percentA proportion of the exposition of the original tokenA that want to be removed
     * @param percentB proportion of the exposition of the original tokenB that want to be removed
     */
    function _removeLiquidity(uint256 percentA, uint256 percentB) internal {
        (uint256 userTokenABalance, uint256 userTokenBBalance, uint256 userFImp) = _getUserDepositSnapshot(msg.sender);
        require(percentA <= 100 && percentB <= 100, "AMM: forbidden percent");

        uint256 originalBalanceAToReduce = percentA.mul(userTokenABalance).div(PERCENT_PRECISION);
        uint256 originalBalanceBToReduce = percentB.mul(userTokenBBalance).div(PERCENT_PRECISION);

        // Get Pool Balances
        (uint256 totalTokenA, uint256 totalTokenB) = _getPoolBalances();

        // Get ABPrice
        uint256 ABPrice = _getABPrice();

        // Calculate the Pool's Value Factor (Fimp)
        uint256 fImpOpening = _getFImpOpening(
            totalTokenA,
            totalTokenB,
            ABPrice,
            deamortizedTokenABalance,
            deamortizedTokenBBalance
        );

        // Calculate Multipliers
        Mult memory multipliers = _getMultipliers(totalTokenA, totalTokenB, fImpOpening);

        // Update User balance
        userSnapshots[msg.sender].tokenABalance = userTokenABalance.sub(originalBalanceAToReduce);
        userSnapshots[msg.sender].tokenBBalance = userTokenBBalance.sub(originalBalanceBToReduce);

        // Update deamortized balance
        deamortizedTokenABalance = deamortizedTokenABalance.sub(
            originalBalanceAToReduce.mul(10**FIMP_DECIMALS).div(userFImp)
        );
        deamortizedTokenBBalance = deamortizedTokenBBalance.sub(
            originalBalanceBToReduce.mul(10**FIMP_DECIMALS).div(userFImp)
        );

        // Calculate amount to send
        (uint256 withdrawAmountA, uint256 withdrawAmountB) = _getWithdrawAmounts(
            originalBalanceAToReduce,
            originalBalanceBToReduce,
            userFImp,
            multipliers
        );

        _onRemoveLiquidity(userSnapshots[msg.sender], msg.sender);

        // Transfers / Update
        if (withdrawAmountA > 0) {
            IERC20(_tokenA).safeTransfer(msg.sender, withdrawAmountA);
        }

        if (withdrawAmountB > 0) {
            IERC20(_tokenB).safeTransfer(msg.sender, withdrawAmountB);
        }

        emit RemoveLiquidity(msg.sender, withdrawAmountA, withdrawAmountB);
    }

    /**
     * @notice _tradeExactAInput msg.sender is able to trade exact amount of token A in exchange for minimum
     * amount of token B sent by the contract to the owner
     * @dev The inheritor contract should implement _getTradeDetailsExactAInput and _onTradeExactAInput functions
     * _getTradeDetailsExactAInput should return tradeDetails struct format
     *
     * @param exactAmountAIn exact amount of A token that will be transfer from msg.sender
     * @param minAmountBOut minimum acceptable amount of token B to transfer to owner
     * @param owner the destination address that will receive the token B
     */
    function _tradeExactAInput(
        uint256 exactAmountAIn,
        uint256 minAmountBOut,
        address owner
    ) internal returns (uint256) {
        _isValidInput(exactAmountAIn);
        _isRecipient(owner);
        TradeDetails memory tradeDetails = _getTradeDetailsExactAInput(exactAmountAIn);
        uint256 amountBOut = tradeDetails.amount;
        require(amountBOut > 0, "AMM: invalid amountBOut");
        require(amountBOut >= minAmountBOut, "AMM: slippage not acceptable");

        _onTradeExactAInput(tradeDetails);

        IERC20(_tokenA).safeTransferFrom(msg.sender, address(this), exactAmountAIn);
        IERC20(_tokenB).safeTransfer(owner, amountBOut);

        emit TradeExactAInput(msg.sender, owner, exactAmountAIn, amountBOut);
        return amountBOut;
    }

    /**
     * @notice _tradeExactAOutput owner is able to receive exact amount of token A in exchange of a max
     * acceptable amount of token B sent by the msg.sender to the contract
     *
     * @dev The inheritor contract should implement _getTradeDetailsExactAOutput and _onTradeExactAOutput functions
     * _getTradeDetailsExactAOutput should return tradeDetails struct format
     *
     * @param exactAmountAOut exact amount of token A that will be transfer to owner
     * @param maxAmountBIn maximum acceptable amount of token B to transfer from msg.sender
     * @param owner the destination address that will receive the token A
     */
    function _tradeExactAOutput(
        uint256 exactAmountAOut,
        uint256 maxAmountBIn,
        address owner
    ) internal returns (uint256) {
        _isValidInput(maxAmountBIn);
        _isRecipient(owner);
        TradeDetails memory tradeDetails = _getTradeDetailsExactAOutput(exactAmountAOut);
        uint256 amountBIn = tradeDetails.amount;
        require(amountBIn > 0, "AMM: invalid amountBIn");
        require(amountBIn <= maxAmountBIn, "AMM: slippage not acceptable");

        _onTradeExactAOutput(tradeDetails);

        IERC20(_tokenB).safeTransferFrom(msg.sender, address(this), amountBIn);
        IERC20(_tokenA).safeTransfer(owner, exactAmountAOut);

        emit TradeExactAOutput(msg.sender, owner, amountBIn, exactAmountAOut);
        return amountBIn;
    }

    /**
     * @notice _tradeExactBInput msg.sender is able to trade exact amount of token B in exchange for minimum
     * amount of token A sent by the contract to the owner
     *
     * @dev The inheritor contract should implement _getTradeDetailsExactBInput and _onTradeExactBInput functions
     * _getTradeDetailsExactBInput should return tradeDetails struct format
     *
     * @param exactAmountBIn exact amount of token B that will be transfer from msg.sender
     * @param minAmountAOut minimum acceptable amount of token A to transfer to owner
     * @param owner the destination address that will receive the token A
     */
    function _tradeExactBInput(
        uint256 exactAmountBIn,
        uint256 minAmountAOut,
        address owner
    ) internal returns (uint256) {
        _isValidInput(exactAmountBIn);
        _isRecipient(owner);
        TradeDetails memory tradeDetails = _getTradeDetailsExactBInput(exactAmountBIn);
        uint256 amountAOut = tradeDetails.amount;
        require(amountAOut > 0, "AMM: invalid amountAOut");
        require(amountAOut >= minAmountAOut, "AMM: slippage not acceptable");

        _onTradeExactBInput(tradeDetails);

        IERC20(_tokenB).safeTransferFrom(msg.sender, address(this), exactAmountBIn);
        IERC20(_tokenA).safeTransfer(owner, amountAOut);

        emit TradeExactBInput(msg.sender, owner, exactAmountBIn, amountAOut);
        return amountAOut;
    }

    /**
     * @notice _tradeExactBOutput owner is able to receive exact amount of token B from the contract in exchange of a
     * max acceptable amount of token A sent by the msg.sender to the contract.
     *
     * @dev The inheritor contract should implement _getTradeDetailsExactBOutput and _onTradeExactBOutput functions
     * _getTradeDetailsExactBOutput should return tradeDetails struct format
     *
     * @param exactAmountBOut exact amount of token B that will be transfer to owner
     * @param maxAmountAIn maximum acceptable amount of token A to transfer from msg.sender
     * @param owner the destination address that will receive the token B
     */
    function _tradeExactBOutput(
        uint256 exactAmountBOut,
        uint256 maxAmountAIn,
        address owner
    ) internal returns (uint256) {
        _isValidInput(maxAmountAIn);
        _isRecipient(owner);
        TradeDetails memory tradeDetails = _getTradeDetailsExactBOutput(exactAmountBOut);
        uint256 amountAIn = tradeDetails.amount;
        require(amountAIn > 0, "AMM: invalid amountAIn");
        require(amountAIn <= maxAmountAIn, "AMM: slippage not acceptable");

        _onTradeExactBOutput(tradeDetails);

        IERC20(_tokenA).safeTransferFrom(msg.sender, address(this), amountAIn);
        IERC20(_tokenB).safeTransfer(owner, exactAmountBOut);

        emit TradeExactBOutput(msg.sender, owner, amountAIn, exactAmountBOut);
        return amountAIn;
    }

    /**
     * @notice _getFImpOpening Auxiliary function that calculate the Opening Value Factor Fimp
     *
     * @param _totalTokenA total contract balance of token A
     * @param _totalTokenB total contract balance of token B
     * @param _ABPrice Unit price AB, meaning, how many units of token B could buy 1 unit of token A
     * @param _deamortizedTokenABalance contract deamortized balance of token A
     * @param _deamortizedTokenBBalance contract deamortized balance of token B
     * @return fImpOpening Opening Value Factor Fimp
     */
    function _getFImpOpening(
        uint256 _totalTokenA,
        uint256 _totalTokenB,
        uint256 _ABPrice,
        uint256 _deamortizedTokenABalance,
        uint256 _deamortizedTokenBBalance
    ) internal view returns (uint256) {
        uint256 numerator;
        uint256 denominator;
        {
            numerator = _totalTokenA.mul(_ABPrice).div(10**uint256(_tokenADecimals)).add(_totalTokenB).mul(
                10**FIMP_DECIMALS
            );
        }
        {
            denominator = _deamortizedTokenABalance.mul(_ABPrice).div(10**uint256(_tokenADecimals)).add(
                _deamortizedTokenBBalance
            );
        }

        return numerator.div(denominator);
    }

    /**
     * @notice _getPoolBalances external function that returns the current pool balance of token A and token B
     *
     * @return totalTokenA balanceOf this contract of token A
     * @return totalTokenB balanceOf this contract of token B
     */
    function _getPoolBalances() internal view returns (uint256 totalTokenA, uint256 totalTokenB) {
        totalTokenA = IERC20(_tokenA).balanceOf(address(this));
        totalTokenB = IERC20(_tokenB).balanceOf(address(this));
    }

    /**
     * @notice _getUserDepositSnapshot internal function that User original balance of token A,
     * token B and the Opening Value * * Factor (Fimp) at the moment of the liquidity added
     *
     * @param user address of the user that want to check the balance
     *
     * @return tokenAOriginalBalance balance of token A by the moment of deposit
     * @return tokenBOriginalBalance balance of token B by the moment of deposit
     * @return fImpOriginal value of the Opening Value Factor by the moment of the deposit
     */
    function _getUserDepositSnapshot(address user)
        internal
        view
        returns (
            uint256 tokenAOriginalBalance,
            uint256 tokenBOriginalBalance,
            uint256 fImpOriginal
        )
    {
        tokenAOriginalBalance = userSnapshots[user].tokenABalance;
        tokenBOriginalBalance = userSnapshots[user].tokenBBalance;
        fImpOriginal = userSnapshots[user].fImp;
    }

    /**
     * @notice _getMultipliers internal function that calculate new multipliers based on the current pool position
     *
     * mAA => How much A the users can rescue for each A they deposited
     * mBA => How much A the users can rescue for each B they deposited
     * mBB => How much B the users can rescue for each B they deposited
     * mAB => How much B the users can rescue for each A they deposited
     *
     * @param totalTokenA balanceOf this contract of token A
     * @param totalTokenB balanceOf this contract of token B
     * @param fImpOpening current Open Value Factor
     * @return multipliers multiplier struct containing the 4 multipliers: mAA, mBA, mBB, mAB
     */
    function _getMultipliers(
        uint256 totalTokenA,
        uint256 totalTokenB,
        uint256 fImpOpening
    ) internal view returns (Mult memory multipliers) {
        uint256 totalTokenAWithPrecision = totalTokenA.mul(10**FIMP_DECIMALS);
        uint256 totalTokenBWithPrecision = totalTokenB.mul(10**FIMP_DECIMALS);
        uint256 mAA = 0;
        uint256 mBB = 0;
        uint256 mAB = 0;
        uint256 mBA = 0;

        if (deamortizedTokenABalance > 0) {
            mAA = (_min(deamortizedTokenABalance.mul(fImpOpening), totalTokenAWithPrecision)).div(
                deamortizedTokenABalance
            );
        }

        if (deamortizedTokenBBalance > 0) {
            mBB = (_min(deamortizedTokenBBalance.mul(fImpOpening), totalTokenBWithPrecision)).div(
                deamortizedTokenBBalance
            );
        }
        if (mAA > 0) {
            mAB = totalTokenBWithPrecision.sub(mBB.mul(deamortizedTokenBBalance)).div(deamortizedTokenABalance);
        }

        if (mBB > 0) {
            mBA = totalTokenAWithPrecision.sub(mAA.mul(deamortizedTokenABalance)).div(deamortizedTokenBBalance);
        }

        multipliers = Mult(mAA, mAB, mBA, mBB);
    }

    /**
     * @notice _getRemoveLiquidityAmounts internal function of getRemoveLiquidityAmounts
     *
     * @param percentA percent of exposition A to be removed
     * @param percentB percent of exposition B to be removed
     * @param user address of the account that will be removed
     *
     * @return withdrawAmountA amount of token A that will be rescued
     * @return withdrawAmountB amount of token B that will be rescued
     */
    function _getRemoveLiquidityAmounts(
        uint256 percentA,
        uint256 percentB,
        address user
    ) internal view returns (uint256 withdrawAmountA, uint256 withdrawAmountB) {
        (uint256 totalTokenA, uint256 totalTokenB) = _getPoolBalances();
        (uint256 originalBalanceTokenA, uint256 originalBalanceTokenB, uint256 fImpOriginal) = _getUserDepositSnapshot(
            user
        );

        uint256 originalBalanceAToReduce = percentA.mul(originalBalanceTokenA).div(PERCENT_PRECISION);
        uint256 originalBalanceBToReduce = percentB.mul(originalBalanceTokenB).div(PERCENT_PRECISION);

        bool hasNoLiquidity = totalTokenA == 0 && totalTokenB == 0;
        if (hasNoLiquidity) {
            return (0, 0);
        }

        uint256 ABPrice = _getABPrice();
        uint256 fImpOpening = _getFImpOpening(
            totalTokenA,
            totalTokenB,
            ABPrice,
            deamortizedTokenABalance,
            deamortizedTokenBBalance
        );

        Mult memory multipliers = _getMultipliers(totalTokenA, totalTokenB, fImpOpening);

        (withdrawAmountA, withdrawAmountB) = _getWithdrawAmounts(
            originalBalanceAToReduce,
            originalBalanceBToReduce,
            fImpOriginal,
            multipliers
        );
    }

    /**
     * @notice _getWithdrawAmounts internal function of getRemoveLiquidityAmounts
     *
     * @param _originalBalanceAToReduce amount of original deposit of the token A
     * @param _originalBalanceBToReduce amount of original deposit of the token B
     * @param _userFImp Opening Value Factor by the moment of the deposit
     *
     * @return withdrawAmountA amount of token A that will be rescued
     * @return withdrawAmountB amount of token B that will be rescued
     */
    function _getWithdrawAmounts(
        uint256 _originalBalanceAToReduce,
        uint256 _originalBalanceBToReduce,
        uint256 _userFImp,
        Mult memory multipliers
    ) internal pure returns (uint256 withdrawAmountA, uint256 withdrawAmountB) {
        if (_userFImp > 0) {
            withdrawAmountA = _originalBalanceAToReduce
                .mul(multipliers.AA)
                .add(_originalBalanceBToReduce.mul(multipliers.BA))
                .div(_userFImp);
            withdrawAmountB = _originalBalanceBToReduce
                .mul(multipliers.BB)
                .add(_originalBalanceAToReduce.mul(multipliers.AB))
                .div(_userFImp);
        }
        return (withdrawAmountA, withdrawAmountB);
    }

    /**
     * @notice _getUserBalanceToStore internal auxiliary function to help calculation the
     * tokenA and tokenB value that should be stored in UserDepositSnapshot struct
     *
     * @param amountOfA current deposit of the token A
     * @param amountOfB current deposit of the token B
     * @param fImpOpening Opening Value Factor by the moment of the deposit
     *
     * @return userToStoreTokenA amount of token A that will be stored
     * @return userToStoreTokenB amount of token B that will be stored
     */
    function _getUserBalanceToStore(
        uint256 amountOfA,
        uint256 amountOfB,
        uint256 fImpOpening,
        UserDepositSnapshot memory userDepositSnapshot
    ) internal pure returns (uint256 userToStoreTokenA, uint256 userToStoreTokenB) {
        userToStoreTokenA = amountOfA;
        userToStoreTokenB = amountOfB;

        //Re-add Liquidity case
        if (userDepositSnapshot.fImp != 0) {
            userToStoreTokenA = userDepositSnapshot.tokenABalance.mul(fImpOpening).div(userDepositSnapshot.fImp).add(
                amountOfA
            );
            userToStoreTokenB = userDepositSnapshot.tokenBBalance.mul(fImpOpening).div(userDepositSnapshot.fImp).add(
                amountOfB
            );
        }
    }

    /**
     * @dev Returns the smallest of two numbers.
     */
    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function _getABPrice() internal virtual view returns (uint256 ABPrice);

    function _getTradeDetailsExactAInput(uint256 amountAIn) internal virtual returns (TradeDetails memory);

    function _getTradeDetailsExactAOutput(uint256 amountAOut) internal virtual returns (TradeDetails memory);

    function _getTradeDetailsExactBInput(uint256 amountBIn) internal virtual returns (TradeDetails memory);

    function _getTradeDetailsExactBOutput(uint256 amountBOut) internal virtual returns (TradeDetails memory);

    function _onTradeExactAInput(TradeDetails memory tradeDetails) internal virtual;

    function _onTradeExactAOutput(TradeDetails memory tradeDetails) internal virtual;

    function _onTradeExactBInput(TradeDetails memory tradeDetails) internal virtual;

    function _onTradeExactBOutput(TradeDetails memory tradeDetails) internal virtual;

    function _onRemoveLiquidity(UserDepositSnapshot memory userDepositSnapshot, address owner) internal virtual;

    function _onAddLiquidity(UserDepositSnapshot memory userDepositSnapshot, address owner) internal virtual;

    function _isRecipient(address recipient) private pure {
        require(recipient != address(0), "AMM: transfer to zero address");
    }

    function _isValidInput(uint256 input) private pure {
        require(input > 0, "AMM: input should be greater than zero");
    }
}
