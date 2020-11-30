// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "../lib/RequiredDecimals.sol";

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
 *     function that will be executed after balances updates and before
 *     token transfers. Usually used for handling fees
 * - _onRemoveLiquidity:
 *     function that will be executed after balances updates and before
 *     token transfers. Usually used for handling fees
 *
 *  Also, for which TradeType (E.g: ExactAInput) there are more two functions to override:

 * _getTradeDetails[$TradeType]:
 *   This function is responsible to return the TradeDetails struct, that contains basically the amount
 *   of the other token depending on the trade type. (E.g: ExactAInput => The TradeDetails will return the
 *   amount of B output).
 * _onTrade[$TradeType]:
*     function that will be executed after balances updates and before
 *    token transfers. Usually used for handling fees and updating state at the inheritor.
 *
 */

abstract contract AMM is RequiredDecimals {
    using SafeMath for uint256;

    uint256 constant INITIAL_FIMP = 10**27;
    uint256 constant FIMP_PRECISION = 27;

    // Constructor Info
    address public tokenA;
    address public tokenB;
    uint32 public tokenADecimals;
    uint32 public tokenBDecimals;

    // Updated by the user
    uint256 public deamortizedTokenABalance;
    uint256 public deamortizedTokenBBalance;

    // Total Balance of each token is available in each ERC20 token balanceOf()
    // instead of using local variables, trying to reduce stack too deep
    struct UserBalance {
        uint256 tokenABalance; //originalBalance
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

    mapping(address => UserBalance) public balances;

    /** Events */
    event AddLiquidity(address indexed caller, address indexed owner, uint256 amountOfStable, uint256 amountOfOptions);
    event RemoveLiquidity(address indexed caller, uint256 amountOfStable, uint256 amountOfOptions);
    event TradeExactAInput(address indexed caller, address indexed owner, uint256 exactAmountAIn, uint256 amountBOut);
    event TradeExactBInput(address indexed caller, address indexed owner, uint256 exactAmountBIn, uint256 amountAOut);
    event TradeExactAOutput(address indexed caller, address indexed owner, uint256 amountBIn, uint256 exactAmountAOut);
    event TradeExactBOutput(address indexed caller, address indexed owner, uint256 amountAIn, uint256 exactAmountBOut);

    constructor(address _tokenA, address _tokenB) public {
        require(Address.isContract(_tokenA), "AMM/token-a-is-not-a-contract");
        require(Address.isContract(_tokenB), "AMM/token-b-is-not-a-contract");
        tokenA = _tokenA;
        tokenB = _tokenB;

        tokenADecimals = tryDecimals(IERC20(_tokenA));
        tokenBDecimals = tryDecimals(IERC20(_tokenB));
    }

    /**
     * _addLiquidity in any proportion of tokenA or tokenB
     * The inheritor contract should implement _getABPrice and _onAddLiquidity functions
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
        // 1) Get Totals
        (uint256 totalTokenA, uint256 totalTokenB) = _getPoolBalances();

        bool isInitialLiquidity = totalTokenA == 0 || totalTokenB == 0;
        uint256 fImpOpening;
        uint256 userAmountToStoreTokenA = amountOfA;
        uint256 userAmountToStoreTokenB = amountOfB;

        if (isInitialLiquidity) {
            // only in the initial liquidity is necessary add both tokens in any proportion
            require(amountOfA > 0 && amountOfB > 0, "You should add both tokens on the first liquidity");

            fImpOpening = INITIAL_FIMP;
            deamortizedTokenABalance = amountOfA;
            deamortizedTokenBBalance = amountOfB;
        } else {
            // 1.) get spot price
            uint256 ABPrice = _getABPrice();

            // 2) FImpOpening(balanceOf(A), balanceOf(B), amortizedBalance(A), amortizedBalance(B))
            // fImp = (totalOptions*spotPrice + totalStable) / (deamortizedOption*spotPrice + deamortizedStable)
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
                balances[owner]
            );

            // 4) Update deamortizedBalances;
            // deamortizedBalance = deamortizedBalance + amount/fImpOpening
            deamortizedTokenABalance = deamortizedTokenABalance.add(amountOfA.mul(10**FIMP_PRECISION).div(fImpOpening));
            deamortizedTokenBBalance = deamortizedTokenBBalance.add(amountOfB.mul(10**FIMP_PRECISION).div(fImpOpening));
        }

        // 3) Update User properties (BalanceUserA, BalanceUserB, fImpMoment)
        UserBalance memory userBalance = UserBalance(userAmountToStoreTokenA, userAmountToStoreTokenB, fImpOpening);
        balances[owner] = userBalance;

        _onAddLiquidity(balances[owner], owner);

        require(
            IERC20(tokenA).transferFrom(msg.sender, address(this), amountOfA),
            "Could not transfer option tokens from caller"
        );

        require(
            IERC20(tokenB).transferFrom(msg.sender, address(this), amountOfB),
            "Could not transfer stable tokens from caller"
        );

        emit AddLiquidity(msg.sender, owner, amountOfA, amountOfB);
    }

    /**
     * _removeLiquidity in any proportion of tokenA or tokenB
     * The inheritor contract should implement _getABPrice and _onRemoveLiquidity functions
     *
     * @param amountOfAOriginal proportion of the original tokenA that want to me removed
     * @param amountOfBOriginal proportion of the original tokenB that want to me removed
     */
    function _removeLiquidity(uint256 amountOfAOriginal, uint256 amountOfBOriginal) internal {
        (uint256 userTokenABalance, uint256 userTokenBBalance) = _getUserBalances(msg.sender);
        require(
            amountOfAOriginal <= userTokenABalance && amountOfBOriginal <= userTokenBBalance,
            "not enough original balance"
        );

        (uint256 totalTokenA, uint256 totalTokenB) = _getPoolBalances();

        // 1) Spot Price
        // How many B you need in order to exchange for 1 unit of A
        uint256 ABPrice = _getABPrice();

        // 2) FImpOpening(balanceOf(A), balanceOf(B), amortizedBalance(A), amortizedBalance(B))
        // fImp = (totalOptions*spotPrice + totalStable) / (deamortizedOption*spotPrice + deamortizedStable)
        uint256 fImpOpening = _getFImpOpening(
            totalTokenA,
            totalTokenB,
            ABPrice,
            deamortizedTokenABalance,
            deamortizedTokenBBalance
        );

        Mult memory multipliers = _getMultipliers(totalTokenA, totalTokenB, fImpOpening);

        balances[msg.sender].tokenABalance = userTokenABalance.sub(amountOfAOriginal);
        balances[msg.sender].tokenBBalance = userTokenBBalance.sub(amountOfBOriginal);

        deamortizedTokenABalance = deamortizedTokenABalance.sub(
            amountOfAOriginal.mul(10**FIMP_PRECISION).div(balances[msg.sender].fImp)
        );
        deamortizedTokenBBalance = deamortizedTokenBBalance.sub(
            amountOfBOriginal.mul(10**FIMP_PRECISION).div(balances[msg.sender].fImp)
        );

        // (amountOfAOriginal*AA + amountOfBOriginal*BA) / fImpUser
        uint256 amountToSendA = amountOfAOriginal.mul(multipliers.AA).add(amountOfBOriginal.mul(multipliers.BA)).div(
            balances[msg.sender].fImp
        );
        uint256 amountToSendB = amountOfBOriginal.mul(multipliers.BB).add(amountOfAOriginal.mul(multipliers.AB)).div(
            balances[msg.sender].fImp
        );

        _onRemoveLiquidity(balances[msg.sender], msg.sender);

        // 5. transferFrom(amountA) / transferFrom(amountB) = > Already updates the new balanceOf(a) / balanceOf(b)
        require(IERC20(tokenA).transfer(msg.sender, amountToSendA), "Could not transfer token A from caller");

        require(IERC20(tokenB).transfer(msg.sender, amountToSendB), "Could not transfer token B from caller");

        emit RemoveLiquidity(msg.sender, amountToSendA, amountToSendB);
    }

    function _tradeExactAInput(
        uint256 exactAmountAIn,
        uint256 minAmountBOut,
        address owner
    ) internal returns (uint256) {
        TradeDetails memory tradeDetails = _getTradeDetailsExactAInput(exactAmountAIn);
        uint256 amountBOut = tradeDetails.amount;

        _onTradeExactAInput(tradeDetails);

        require(amountBOut >= minAmountBOut, "amount tokens out lower than min asked");
        require(
            IERC20(tokenA).transferFrom(msg.sender, address(this), exactAmountAIn),
            "Could not transfer token A from caller"
        );

        require(IERC20(tokenB).transfer(owner, amountBOut), "Could not transfer token B to caller");

        emit TradeExactAInput(msg.sender, owner, exactAmountAIn, exactAmountAIn);
        return amountBOut;
    }

    function _tradeExactAOutput(
        uint256 exactAmountAOut,
        uint256 maxAmountBIn,
        address owner
    ) internal returns (uint256) {
        TradeDetails memory tradeDetails = _getTradeDetailsExactAOutput(exactAmountAOut);
        uint256 amountBIn = tradeDetails.amount;

        _onTradeExactAOutput(tradeDetails);

        require(amountBIn <= maxAmountBIn, "amount tokens out higher than max asked");
        require(
            IERC20(tokenB).transferFrom(msg.sender, address(this), amountBIn),
            "Could not transfer token A from caller"
        );

        require(IERC20(tokenA).transfer(owner, exactAmountAOut), "Could not transfer token B to caller");

        emit TradeExactAOutput(msg.sender, owner, exactAmountAOut, amountBIn);
        return amountBIn;
    }

    function _tradeExactBInput(
        uint256 exactAmountBIn,
        uint256 minAmountAOut,
        address owner
    ) internal returns (uint256) {
        TradeDetails memory tradeDetails = _getTradeDetailsExactBInput(exactAmountBIn);
        uint256 amountAOut = tradeDetails.amount;

        _onTradeExactBInput(tradeDetails);

        require(amountAOut >= minAmountAOut, "amount tokens out lower than min asked");
        require(
            IERC20(tokenB).transferFrom(msg.sender, address(this), exactAmountBIn),
            "Could not transfer token A from caller"
        );

        require(IERC20(tokenA).transfer(owner, amountAOut), "Could not transfer token B to caller");

        emit TradeExactBInput(msg.sender, owner, amountAOut, exactAmountBIn);
        return amountAOut;
    }

    function _tradeExactBOutput(
        uint256 exactAmountBOut,
        uint256 maxAmountAIn,
        address owner
    ) internal returns (uint256) {
        TradeDetails memory tradeDetails = _getTradeDetailsExactBOutput(exactAmountBOut);
        uint256 amountAIn = tradeDetails.amount;

        _onTradeExactBInput(tradeDetails);

        require(amountAIn <= maxAmountAIn, "amount tokens out higher than max asked");
        require(
            IERC20(tokenA).transferFrom(msg.sender, address(this), amountAIn),
            "Could not transfer token A from caller"
        );

        require(IERC20(tokenB).transfer(owner, exactAmountBOut), "Could not transfer token B to caller");

        emit TradeExactBOutput(msg.sender, owner, amountAIn, exactAmountBOut);
        return amountAIn;
    }

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
            numerator = _totalTokenA.mul(_ABPrice).div(10**uint256(tokenADecimals)).add(_totalTokenB).mul(
                10**FIMP_PRECISION
            );
        }
        {
            denominator = _deamortizedTokenABalance.mul(_ABPrice).div(10**uint256(tokenADecimals)).add(
                _deamortizedTokenBBalance
            );
        }
        uint256 fImpOpening = numerator.div(denominator);
        return fImpOpening;
    }

    function getPoolBalances() public view returns (uint256, uint256) {
        return _getPoolBalances();
    }

    function getWorthUserBalances(address user) external view returns (uint256, uint256) {
        (uint256 totalTokenA, uint256 totalTokenB) = _getPoolBalances();
        uint256 ABPrice = _getABPrice();
        uint256 fImpOpening = _getFImpOpening(
            totalTokenA,
            totalTokenB,
            ABPrice,
            deamortizedTokenABalance,
            deamortizedTokenBBalance
        );
        uint256 worthBalanceTokenA = balances[user].tokenABalance.mul(fImpOpening).div(balances[user].fImp);
        uint256 worthBalanceTokenB = balances[user].tokenBBalance.mul(fImpOpening).div(balances[user].fImp);
        return (worthBalanceTokenA, worthBalanceTokenB);
    }

    function getMaxWithdrawBalances(address user) external view returns (uint256, uint256) {
        (uint256 totalTokenA, uint256 totalTokenB) = _getPoolBalances();
        uint256 ABPrice = _getABPrice();
        uint256 fImpOpening = _getFImpOpening(
            totalTokenA,
            totalTokenB,
            ABPrice,
            deamortizedTokenABalance,
            deamortizedTokenBBalance
        );

        Mult memory m = _getMultipliers(totalTokenA, totalTokenB, fImpOpening);
        (uint256 maxWithdrawTokenA, uint256 maxWithdrawTokenB) = _getAvailableForRescueAmounts(balances[user], m);
        return (maxWithdrawTokenA, maxWithdrawTokenB);
    }

    function _getPoolBalances() internal view returns (uint256, uint256) {
        uint256 balanceOfTokenA = IERC20(tokenA).balanceOf(address(this));
        uint256 balanceOfTokenB = IERC20(tokenB).balanceOf(address(this));

        return (balanceOfTokenA, balanceOfTokenB);
    }

    function _getUserBalances(address user) internal view returns (uint256, uint256) {
        uint256 balanceOfTokenA = balances[user].tokenABalance;
        uint256 balanceOfTokenB = balances[user].tokenBBalance;

        return (balanceOfTokenA, balanceOfTokenB);
    }

    function _getMultipliers(
        uint256 totalTokenA,
        uint256 totalTokenB,
        uint256 fImpOpening
    ) internal view returns (Mult memory) {
        uint256 totalTokenAWithPrecision = totalTokenA.mul(10**FIMP_PRECISION);
        uint256 totalTokenBWithPrecision = totalTokenB.mul(10**FIMP_PRECISION);
        uint256 mAA = 0;
        uint256 mBB = 0;
        uint256 mAB = 0;
        uint256 mBA = 0;

        if (deamortizedTokenABalance > 0) {
            mAA = (min(deamortizedTokenABalance.mul(fImpOpening), totalTokenAWithPrecision)).div(
                deamortizedTokenABalance
            );
        }

        if (deamortizedTokenBBalance > 0) {
            mBB = (min(deamortizedTokenBBalance.mul(fImpOpening), totalTokenBWithPrecision)).div(
                deamortizedTokenBBalance
            );
        }
        if (mAA > 0) {
            mAB = totalTokenBWithPrecision.sub(mBB.mul(deamortizedTokenBBalance)).div(deamortizedTokenABalance);
        }

        if (mBB > 0) {
            mBA = totalTokenAWithPrecision.sub(mAA.mul(deamortizedTokenABalance)).div(deamortizedTokenBBalance);
        }

        Mult memory multipliers = Mult(mAA, mAB, mBA, mBB);
        return multipliers;
    }

    function _getAvailableForRescueAmounts(UserBalance memory user, Mult memory m)
        internal
        pure
        returns (uint256, uint256)
    {
        uint256 userMAB = user.tokenBBalance.mul(m.AB).div(user.fImp);
        uint256 userMBB = user.tokenBBalance.mul(m.BB).div(user.fImp);
        uint256 userMAA = user.tokenABalance.mul(m.AA).div(user.fImp);
        uint256 userMBA = user.tokenABalance.mul(m.BA).div(user.fImp);

        uint256 tokenAAvailableForRescue = userMAA.add(userMBA);
        uint256 tokenBAvailableForRescue = userMBB.add(userMAB);
        return (tokenAAvailableForRescue, tokenBAvailableForRescue);
    }

    function _getNewAmortizedBalances(
        Mult memory m,
        uint256 amountTokenA,
        uint256 amountTokenB
    ) internal pure returns (uint256, uint256) {
        uint256 qA;
        uint256 qB;

        if (m.AB == 0) {
            qB = amountTokenB.div(m.BB);
            qA = amountTokenA.sub(m.BA.mul(qB)).div(m.AA);
        } else {
            qB = amountTokenA.sub(m.AA.mul(amountTokenB.div(m.AB))).div(m.BA.sub(m.AA.mul(m.BB.div(m.AB))));
            qA = amountTokenB.sub(m.BB.mul(qB)).div(m.AB);
        }

        return (qA, qB);
    }

    function _getUserBalanceToStore(
        uint256 amountOfA,
        uint256 amountOfB,
        uint256 fImpOpening,
        UserBalance memory userBalance
    ) internal pure returns (uint256, uint256) {
        uint256 userToStoreTokenA = amountOfA;
        uint256 userToStoreTokenB = amountOfB;

        //Re-add Liquidity case
        if (userBalance.fImp != 0) {
            userToStoreTokenA = userBalance.tokenABalance.mul(fImpOpening).div(userBalance.fImp).add(amountOfA);
            userToStoreTokenB = userBalance.tokenBBalance.mul(fImpOpening).div(userBalance.fImp).add(amountOfB);
        }

        return (userToStoreTokenA, userToStoreTokenB);
    }

    /**
     * @dev Returns the smallest of two numbers.
     */
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function _getABPrice() internal virtual view returns (uint256);

    function _getTradeDetailsExactAInput(uint256 amountAIn) internal virtual returns (TradeDetails memory);

    function _getTradeDetailsExactAOutput(uint256 amountAOut) internal virtual returns (TradeDetails memory);

    function _getTradeDetailsExactBInput(uint256 amountBIn) internal virtual returns (TradeDetails memory);

    function _getTradeDetailsExactBOutput(uint256 amountBOut) internal virtual returns (TradeDetails memory);

    function _onTradeExactAInput(TradeDetails memory tradeDetails) internal virtual;

    function _onTradeExactAOutput(TradeDetails memory tradeDetails) internal virtual;

    function _onTradeExactBInput(TradeDetails memory tradeDetails) internal virtual;

    function _onTradeExactBOutput(TradeDetails memory tradeDetails) internal virtual;

    function _onRemoveLiquidity(UserBalance memory userBalance, address owner) internal virtual;

    function _onAddLiquidity(UserBalance memory userBalance, address owner) internal virtual;
}
