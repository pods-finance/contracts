// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "../lib/RequiredDecimals.sol";
import "../interfaces/IAMM.sol";
import "@nomiclabs/buidler/console.sol";

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

abstract contract AMM is IAMM, RequiredDecimals {
    using SafeMath for uint256;

    /**
     * @dev The initial value for deposit factor (Fimp)
     */
    uint256 public constant INITIAL_FIMP = 10**27;

    /**
     * @notice The Fimp's precision (aka number of decimals)
     */
    uint256 public constant FIMP_PRECISION = 27;

    /**
     * @notice Address of the token A
     */
    address public tokenA;

    /**
     * @notice Address of the token B
     */
    address public tokenB;

    /**
     * @notice Token A number of decimals
     */
    uint8 public tokenADecimals;

    /**
     * @notice Token B number of decimals
     */
    uint8 public tokenBDecimals;

    /**
     * @notice The total balance of token A in the pool not counting the amortization
     */
    uint256 public deamortizedTokenABalance;

    /**
     * @notice The total balance of token B in the pool not counting the amortization
     */
    uint256 public deamortizedTokenBBalance;

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
    /**
     * @notice Tracks the UserBalance struct of each user.
     * It contains the token A original balance, token B original balance,
     * and the Open Value Factor (Fimp) at the time of the deposit.
     */
    mapping(address => UserBalance) public balances;

    /** Events */
    event AddLiquidity(address indexed caller, address indexed owner, uint256 amountOfStable, uint256 amountOfOptions);
    event RemoveLiquidity(address indexed caller, uint256 amountOfStable, uint256 amountOfOptions);
    event TradeExactAInput(address indexed caller, address indexed owner, uint256 exactAmountAIn, uint256 amountBOut);
    event TradeExactBInput(address indexed caller, address indexed owner, uint256 exactAmountBIn, uint256 amountAOut);
    event TradeExactAOutput(address indexed caller, address indexed owner, uint256 amountBIn, uint256 exactAmountAOut);
    event TradeExactBOutput(address indexed caller, address indexed owner, uint256 amountAIn, uint256 exactAmountBOut);

    constructor(address _tokenA, address _tokenB) public {
        require(Address.isContract(_tokenA), "AMM: token a is not a contract");
        require(Address.isContract(_tokenB), "AMM: token b is not a contract");
        tokenA = _tokenA;
        tokenB = _tokenB;

        tokenADecimals = tryDecimals(IERC20(_tokenA));
        tokenBDecimals = tryDecimals(IERC20(_tokenB));
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
     * @notice _getUserBalance external function that User original balance of token A,
     * token B and the Opening Value * * Factor (Fimp) at the moment of the liquidity added
     *
     * @param user address to check the balance info
     *
     * @return tokenAOriginalBalance balance of token A by the moment of deposit
     * @return tokenBOriginalBalance balance of token B by the moment of deposit
     * @return fImpUser value of the Opening Value Factor by the moment of the deposit
     */
    function getOwnerBalance(address owner)
        external
        view
        returns (
            uint256 tokenAOriginalBalance,
            uint256 tokenBOriginalBalance,
            uint256 fImpOwner
        )
    {
        return _getOwnerBalance(user);
    }

    /**
     * @notice getRemoveLiquidityAmounts external function that returns the available for rescue
     * amounts of token A, and token B based on the original position
     *
     * @param balanceTokenA amount of original deposit of the token A
     * @param balanceTokenB amount of original deposit of the token B
     * @param fImpOriginal Opening Value Factor by the moment of the deposit
     *
     * @return withdrawAmountA amount of token A that will be rescued
     * @return withdrawAmountB amount of token B that will be rescued
     */
    function getRemoveLiquidityAmounts(
        uint256 percentA,
        uint256 percentB,
        address owner
    ) external view returns (uint256 withdrawAmountA, uint256 withdrawAmountB) {
        return _getRemoveLiquidityAmounts(percentA, percentB, owner);
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
        (uint256 userTokenABalance, uint256 userTokenBBalance, uint256 userFImp) = _getUserBalance(user);

        (maxWithdrawAmountA, maxWithdrawAmountB) = _getRemoveLiquidityAmounts(
            userTokenABalance,
            userTokenBBalance,
            userFImp
        );
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
        console.log("AMM: addLiquidity");
        // 1) Get Pool Balances
        (uint256 totalTokenA, uint256 totalTokenB) = _getPoolBalances();

        bool hasNoLiquidity = totalTokenA == 0 && totalTokenB == 0;
        uint256 fImpOpening;
        uint256 userAmountToStoreTokenA = amountOfA;
        uint256 userAmountToStoreTokenB = amountOfB;

        console.log("totalTokenA", totalTokenA);
        console.log("totalTokenB", totalTokenB);
        if (hasNoLiquidity) {
            console.log("caiu dentro do if");
            // In the first liquidity, is necessary add both tokens
            require(amountOfA > 0 && amountOfB > 0, "AMM: you should add both tokens on the first liquidity");

            fImpOpening = INITIAL_FIMP;
            deamortizedTokenABalance = amountOfA;
            deamortizedTokenBBalance = amountOfB;
        } else {
            console.log("caiu dentro do else");
            // 2) Get spot price
            uint256 ABPrice = _getABPrice();
            console.log("ABPrice", ABPrice);
            require(ABPrice > 0, "AMM: can not add liquidity when option price is zero");

            // 3) Calculate Fimp
            //FImpOpening(balanceOf(A), balanceOf(B), amortizedBalance(A), amortizedBalance(B))
            // fImp = (totalOptions*spotPrice + totalStable) / (deamortizedOption*spotPrice + deamortizedStable)
            fImpOpening = _getFImpOpening(
                totalTokenA,
                totalTokenB,
                ABPrice,
                deamortizedTokenABalance,
                deamortizedTokenBBalance
            );

            // 4) Update amount of user to store in case of re-add liquidity;
            (userAmountToStoreTokenA, userAmountToStoreTokenB) = _getUserBalanceToStore(
                amountOfA,
                amountOfB,
                fImpOpening,
                balances[owner]
            );

            // 5) Update deamortizedBalances;
            // deamortizedBalance = deamortizedBalance + amount/fImpOpening
            deamortizedTokenABalance = deamortizedTokenABalance.add(amountOfA.mul(10**FIMP_PRECISION).div(fImpOpening));
            deamortizedTokenBBalance = deamortizedTokenBBalance.add(amountOfB.mul(10**FIMP_PRECISION).div(fImpOpening));
        }

        // 6) Update User properties (tokenABalance, tokenBBalance, fImp)
        UserBalance memory userBalance = UserBalance(userAmountToStoreTokenA, userAmountToStoreTokenB, fImpOpening);
        balances[owner] = userBalance;

        _onAddLiquidity(balances[owner], owner);

        require(
            IERC20(tokenA).transferFrom(msg.sender, address(this), amountOfA),
            "AMM: could not transfer option tokens from caller"
        );

        require(
            IERC20(tokenB).transferFrom(msg.sender, address(this), amountOfB),
            "AMM: could not transfer stable tokens from caller"
        );

        emit AddLiquidity(msg.sender, owner, amountOfA, amountOfB);
    }

    /**
     * @notice _removeLiquidity in any proportion of tokenA or tokenB
     * @dev The inheritor contract should implement _getABPrice and _onRemoveLiquidity functions
     *
     * @param amountOfAOriginal proportion of the original tokenA that want to be removed
     * @param amountOfBOriginal proportion of the original tokenB that want to be removed
     */
    function _removeLiquidity(uint256 percentA, uint256 percentB) internal {
        (uint256 userTokenABalance, uint256 userTokenBBalance, ) = _getUserBalance(msg.sender);
        require(percentA <= 100 && percentB <= 100, "AMM: forbidden removal percent");

        uint256 originalBalanceAToReduce = percentA.mul(userTokenABalance).div(100);
        uint256 originalBalanceBToReduce = percentB.mul(userTokenBBalance).div(100);

        // 1) Get Pool Balances
        (uint256 totalTokenA, uint256 totalTokenB) = _getPoolBalances();

        // 2) Spot Price
        // How many B you need in order to exchange for 1 unit of A
        uint256 ABPrice = _getABPrice();

        // 2) Calculate Fimp
        // FImpOpening(balanceOf(A), balanceOf(B), amortizedBalance(A), amortizedBalance(B))
        // fImp = (totalOptions*spotPrice + totalStable) / (deamortizedOption*spotPrice + deamortizedStable)
        uint256 fImpOpening =
            _getFImpOpening(totalTokenA, totalTokenB, ABPrice, deamortizedTokenABalance, deamortizedTokenBBalance);

        // 3) Calculate Multipliers
        Mult memory multipliers = _getMultipliers(totalTokenA, totalTokenB, fImpOpening);

        // 4) Update user balance

        balances[msg.sender].tokenABalance = userTokenABalance.sub(originalBalanceAToReduce);
        balances[msg.sender].tokenBBalance = userTokenBBalance.sub(originalBalanceBToReduce);

        // 5) Update deamortized balance
        deamortizedTokenABalance = deamortizedTokenABalance.sub(
            originalBalanceAToReduce.mul(10**FIMP_PRECISION).div(balances[msg.sender].fImp)
        );
        deamortizedTokenBBalance = deamortizedTokenBBalance.sub(
            originalBalanceBToReduce.mul(10**FIMP_PRECISION).div(balances[msg.sender].fImp)
        );

        // 6) Calculate amount to send
        uint256 amountToSendA =
            originalBalanceAToReduce.mul(multipliers.AA).add(originalBalanceBToReduce.mul(multipliers.BA)).div(
                balances[msg.sender].fImp
            );
        uint256 amountToSendB =
            originalBalanceBToReduce.mul(multipliers.BB).add(originalBalanceAToReduce.mul(multipliers.AB)).div(
                balances[msg.sender].fImp
            );

        _onRemoveLiquidity(balances[msg.sender], msg.sender);

        // 7) Transfers / Update
        if (amountToSendA > 0) {
            require(IERC20(tokenA).transfer(msg.sender, amountToSendA), "AMM: could not transfer token A from caller");
        }

        if (amountToSendB > 0) {
            require(IERC20(tokenB).transfer(msg.sender, amountToSendB), "AMM: could not transfer token B from caller");
        }

        emit RemoveLiquidity(msg.sender, amountToSendA, amountToSendB);
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
        TradeDetails memory tradeDetails = _getTradeDetailsExactAInput(exactAmountAIn);
        uint256 amountBOut = tradeDetails.amount;
        require(amountBOut > 0, "AMM: can not trade when option price is zero");

        _onTradeExactAInput(tradeDetails);

        require(amountBOut >= minAmountBOut, "AMM: amount tokens out lower than minimum asked");
        require(
            IERC20(tokenA).transferFrom(msg.sender, address(this), exactAmountAIn),
            "AMM: could not transfer token A from caller"
        );

        require(IERC20(tokenB).transfer(owner, amountBOut), "AMM: could not transfer token B to caller");

        emit TradeExactAInput(msg.sender, owner, exactAmountAIn, exactAmountAIn);
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
        TradeDetails memory tradeDetails = _getTradeDetailsExactAOutput(exactAmountAOut);
        uint256 amountBIn = tradeDetails.amount;
        require(amountBIn > 0, "AMM: can not trade when option price is zero");

        _onTradeExactAOutput(tradeDetails);

        require(amountBIn <= maxAmountBIn, "AMM: amount tokens out higher than maximum asked");
        require(
            IERC20(tokenB).transferFrom(msg.sender, address(this), amountBIn),
            "AMM: could not transfer token A from caller"
        );

        require(IERC20(tokenA).transfer(owner, exactAmountAOut), "AMM: could not transfer token B to caller");

        emit TradeExactAOutput(msg.sender, owner, exactAmountAOut, amountBIn);
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
        TradeDetails memory tradeDetails = _getTradeDetailsExactBInput(exactAmountBIn);
        uint256 amountAOut = tradeDetails.amount;
        require(amountAOut > 0, "AMM: can not trade when option price is zero");

        _onTradeExactBInput(tradeDetails);

        require(amountAOut >= minAmountAOut, "AMM: amount tokens out lower than minimum asked");
        require(
            IERC20(tokenB).transferFrom(msg.sender, address(this), exactAmountBIn),
            "AMM: could not transfer token A from caller"
        );

        require(IERC20(tokenA).transfer(owner, amountAOut), "AMM: could not transfer token B to caller");

        emit TradeExactBInput(msg.sender, owner, amountAOut, exactAmountBIn);
        return amountAOut;
    }

    /**
     * @notice _tradeExactBOutput owner is able to receive exact amount of token B from the contract in exchange of a
     * max acceptable amount of token A sent by the msg.sender to the contract.
     *
     * @dev The inheritor contract should implement _getTradeDetailsExactBOutput and _onTradeExactBInput functions
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
        TradeDetails memory tradeDetails = _getTradeDetailsExactBOutput(exactAmountBOut);
        uint256 amountAIn = tradeDetails.amount;
        require(amountAIn > 0, "AMM: can not trade when option price is zero");

        _onTradeExactBInput(tradeDetails);

        require(amountAIn <= maxAmountAIn, "AMM: amount tokens out higher than maximum asked");
        require(
            IERC20(tokenA).transferFrom(msg.sender, address(this), amountAIn),
            "AMM: could not transfer token A from caller"
        );

        require(IERC20(tokenB).transfer(owner, exactAmountBOut), "AMM: could not transfer token B to caller");

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
    ) internal view returns (uint256 fImpOpening) {
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

        fImpOpening = numerator.div(denominator);
        return fImpOpening;
    }

    /**
     * @notice _getPoolBalances external function that returns the current pool balance of token A and token B
     *
     * @return totalTokenA balanceOf this contract of token A
     * @return totalTokenB balanceOf this contract of token B
     */
    function _getPoolBalances() internal view returns (uint256 totalTokenA, uint256 totalTokenB) {
        totalTokenA = IERC20(tokenA).balanceOf(address(this));
        totalTokenB = IERC20(tokenB).balanceOf(address(this));

        return (totalTokenA, totalTokenB);
    }

    /**
     * @notice _getUserBalance internal function that User original balance of token A,
     * token B and the Opening Value * * Factor (Fimp) at the moment of the liquidity added
     *
     * @param user address of the user that want to check the balance
     *
     * @return tokenABalance balance of token A by the moment of deposit
     * @return tokenBBalance balance of token B by the moment of deposit
     * @return fImpUser value of the Opening Value Factor by the moment of the deposit
     */
    function _getUserBalance(address user)
        internal
        view
        returns (
            uint256 tokenAOriginalBalance,
            uint256 tokenBOriginalBalance,
            uint256 fImpUser
        )
    {
        tokenAOriginalBalance = balances[user].tokenABalance;
        tokenBOriginalBalance = balances[user].tokenBBalance;
        fImpUser = balances[user].fImp;

        return (tokenAOriginalBalance, tokenBOriginalBalance, fImpUser);
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
        uint256 totalTokenAWithPrecision = totalTokenA.mul(10**FIMP_PRECISION);
        uint256 totalTokenBWithPrecision = totalTokenB.mul(10**FIMP_PRECISION);
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
        return multipliers;
    }

    /**
     * @notice _getRemoveLiquidityAmounts internal function of getRemoveLiquidityAmounts
     *
     * @param percentA percent of exposition A to be removed
     * @param percentB percent of exposition B to be removed
     * @param owner owner of the 
     *
     * @return withdrawAmountA amount of token A that will be rescued
     * @return withdrawAmountB amount of token B that will be rescued
     */
    function _getRemoveLiquidityAmounts(
        uint256 percentA,
        uint256 percentB,
        address owner
    ) internal view returns (uint256 withdrawAmountA, uint256 withdrawAmountB) {
        (uint256 totalTokenA, uint256 totalTokenB) = _getPoolBalances();
        bool hasNoLiquidity = totalTokenA == 0 && totalTokenB == 0;
        if (hasNoLiquidity) {
            return (0, 0);
        }

        uint256 ABPrice = _getABPrice();
        uint256 fImpOpening =
            _getFImpOpening(totalTokenA, totalTokenB, ABPrice, deamortizedTokenABalance, deamortizedTokenBBalance);

        Mult memory multipliers = _getMultipliers(totalTokenA, totalTokenB, fImpOpening);

        (withdrawAmountA, withdrawAmountB) = _getAvailableForRescueAmounts(
            balanceTokenA,
            balanceTokenB,
            fImpOriginal,
            multipliers
        );
        return (withdrawAmountA, withdrawAmountB);
    }

    /**
     * @notice _getAvailableForRescueAmounts internal function of getRemoveLiquidityAmounts
     *
     * @param _balanceTokenA amount of original deposit of the token A
     * @param _balanceTokenB amount of original deposit of the token B
     * @param _fImpOriginal Opening Value Factor by the moment of the deposit
     *
     * @return tokenAAvailableForRescue amount of token A that will be rescued
     * @return tokenBAvailableForRescue amount of token B that will be rescued
     */
    function _getAvailableForRescueAmounts(
        uint256 _balanceTokenA,
        uint256 _balanceTokenB,
        uint256 _fImpOriginal,
        Mult memory m
    ) internal pure returns (uint256 tokenAAvailableForRescue, uint256 tokenBAvailableForRescue) {
        if (_fImpOriginal > 0) {
            uint256 userMAB = _balanceTokenB.mul(m.AB).div(_fImpOriginal);
            uint256 userMBB = _balanceTokenB.mul(m.BB).div(_fImpOriginal);
            uint256 userMAA = _balanceTokenA.mul(m.AA).div(_fImpOriginal);
            uint256 userMBA = _balanceTokenA.mul(m.BA).div(_fImpOriginal);

            tokenAAvailableForRescue = userMAA.add(userMBA);
            tokenBAvailableForRescue = userMBB.add(userMAB);
        }
        return (tokenAAvailableForRescue, tokenBAvailableForRescue);
    }

    /**
     * @notice _getUserBalanceToStore internal auxiliary function to help calculation the
     * tokenA and tokenB value that should be store in UserBalance struct
     *
     * @param amountOfA amount of original deposit of the token A
     * @param amountOfB amount of original deposit of the token B
     * @param fImpOpening Opening Value Factor by the moment of the deposit
     *
     * @return userToStoreTokenA amount of token A that will be rescued
     * @return userToStoreTokenB amount of token B that will be rescued
     */
    function _getUserBalanceToStore(
        uint256 amountOfA,
        uint256 amountOfB,
        uint256 fImpOpening,
        UserBalance memory userBalance
    ) internal pure returns (uint256 userToStoreTokenA, uint256 userToStoreTokenB) {
        userToStoreTokenA = amountOfA;
        userToStoreTokenB = amountOfB;

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
    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function _getABPrice() internal view virtual returns (uint256 ABPrice);

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
