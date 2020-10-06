// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@nomiclabs/buidler/console.sol";

abstract contract AMM {
    using SafeMath for uint256;

    uint256 constant INITIAL_FIMP = 10**18;
    uint32 constant WAD_DECIMALS = 18;

    // Constructor Info
    address public tokenA;
    address public tokenB;
    uint32 public tokenADecimals;
    uint32 public tokenBDecimals;

    // Updated by the user
    uint256 public deamortizedTokenABalance;
    uint256 public deamortizedTokenBBalance;

    // Total Balance of each tokem is avaiable in eacch ERC20 token balanceOf()
    // instead of using local variables, trying to reduce stack too deep
    struct UserBalance {
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
        uint256 amountOut;
        bytes32 params;
    }

    mapping(address => UserBalance) public balances;

    /** Events */
    event AddLiquidity(address indexed caller, uint256 amountOfStable, uint256 amountOfOptions);
    event RemoveLiquidity(address indexed caller, uint256 amountOfStable, uint256 amountOfOptions);
    event BuyExact(address indexed caller, uint256 amountIn, uint256 amountOut);
    event SellExact(address indexed caller, uint256 amountIn, uint256 amountOut);

    constructor(address _tokenA, address _tokenB) public {
        tokenA = _tokenA;
        tokenB = _tokenB;

        tokenADecimals = ERC20(_tokenA).decimals();
        tokenBDecimals = ERC20(_tokenB).decimals();
    }

    function addLiquidity(uint256 amountOfA, uint256 amountOfB) public {
        // 2) Calculate Totals
        (uint256 totalTokenA, uint256 totalTokenB) = _getPoolBalances();

        bool isInitialLiquidity = totalTokenA == 0 || totalTokenB == 0;
        uint256 fImpOpening;

        if (isInitialLiquidity) {
            require(amountOfA > 0 && amountOfB > 0, "You should add both tokens on the first liquidity");

            fImpOpening = INITIAL_FIMP;
            deamortizedTokenABalance = amountOfA;
            deamortizedTokenBBalance = amountOfB;
        } else {
            // 1.) get spot price
            uint256 ABPrice = _getABPrice();

            // 2) FImpOpening(balanceOf(A), balanceOf(B), amortizedBalance(A), amortizedBalance(B))
            // fImp = (totalOptions*spotPrice + totalStable) / (deamortizedOption*spotPrice + deamortizedStable)
            fImpOpening = totalTokenA.mul(ABPrice).add(totalTokenB).div(
                deamortizedTokenABalance.mul(ABPrice).add(deamortizedTokenBBalance)
            );

            // 4) Update demortizedBalances;
            // deamortizedBalance = deamortizedBalance + amount/fImpOpening
            deamortizedTokenABalance = deamortizedTokenABalance.add(amountOfA.div(fImpOpening));
            deamortizedTokenBBalance = deamortizedTokenBBalance.add(amountOfB.div(fImpOpening));
        }

        // 3) Update User properties (BalanceUserA, BalanceUserB, fImpMoment)
        UserBalance memory userBalance = UserBalance(amountOfA, amountOfB, fImpOpening);

        if (balances[msg.sender].fImp != 0) {
            // Update position logic
            // Remove Liquidity + Add liquidty (total) => Economizar bsPrice
        }

        balances[msg.sender] = userBalance;

        // 5. transferFrom(amountA) / transferFrom(amountB) = > Already updates the new balanceOf(a) / balanceOf(b)
        require(
            ERC20(tokenA).transferFrom(msg.sender, address(this), amountOfA),
            "Could not transfer option tokens from caller"
        );

        require(
            ERC20(tokenB).transferFrom(msg.sender, address(this), amountOfB),
            "Could not transfer stable tokens from caller"
        );

        emit AddLiquidity(msg.sender, amountOfA, amountOfB);
    }

    function removeLiquidity(uint256 amountOfAOriginal, uint256 amountOfBOriginal) public {
        {
            (uint256 userTokenABalance, uint256 userTokenBBalance) = _getUserBalances(msg.sender);
            require(
                amountOfAOriginal <= userTokenABalance && amountOfBOriginal <= userTokenBBalance,
                "not enough original balance"
            );

            balances[msg.sender].tokenABalance = userTokenABalance.sub(amountOfAOriginal);
            balances[msg.sender].tokenBBalance = userTokenBBalance.sub(amountOfBOriginal);

            deamortizedTokenABalance = deamortizedTokenABalance.sub(amountOfAOriginal.div(balances[msg.sender].fImp));
            deamortizedTokenBBalance = deamortizedTokenBBalance.sub(amountOfBOriginal.div(balances[msg.sender].fImp));
        }

        (uint256 totalTokenA, uint256 totalTokenB) = _getPoolBalances();
        // 1) Spot Price
        // How many B you need in order to exchange for 1 unit of A
        uint256 ABPrice = _getABPrice();
        // 2) FImpOpening(balanceOf(A), balanceOf(B), amortizedBalance(A), amortizedBalance(B))
        // fImp = (totalOptions*spotPrice + totalStable) / (deamortizedOption*spotPrice + deamortizedStable)
        uint256 fImpOpening = totalTokenA.mul(ABPrice).add(totalTokenB).div(
            deamortizedTokenABalance.mul(ABPrice).add(deamortizedTokenBBalance)
        );

        Mult memory multipliers = _getMultipliers(totalTokenA, totalTokenB, fImpOpening);

        uint256 amountToSendA = amountOfAOriginal.mul(multipliers.AA).add(amountOfBOriginal.mul(multipliers.BA));
        uint256 amountToSendB = amountOfBOriginal.mul(multipliers.BB).add(amountOfAOriginal.mul(multipliers.AB));

        // 5. transferFrom(amountA) / transferFrom(amountB) = > Already updates the new balanceOf(a) / balanceOf(b)
        require(ERC20(tokenA).transfer(msg.sender, amountToSendA), "Could not transfer token A from caller");

        require(ERC20(tokenB).transfer(msg.sender, amountToSendB), "Could not transfer token B from caller");

        emit RemoveLiquidity(msg.sender, amountToSendA, amountToSendB);
    }

    function _buyTokensWithExactTokens(uint256 amountTokenA, uint256 minAmountOfTokensB) public returns (uint256) {
        TradeDetails memory tradeDetails = _getTradeDetails(amountTokenA);
        uint256 amountOfTokenBOut = tradeDetails.amountOut;

        _onTrade(tradeDetails);

        // 5. transfer assets
        require(amountOfTokenBOut >= minAmountOfTokensB, "slippage higher than asked");
        require(ERC20(tokenA).transferFrom(msg.sender, address(this), amountTokenA), "not transfered asset");

        require(ERC20(tokenB).transfer(msg.sender, amountOfTokenBOut), "not transfered asset");

        emit BuyExact(msg.sender, amountTokenA, amountOfTokenBOut);
        return amountOfTokenBOut;
    }

    // function _buyExactTokensWithTokens(uint256 maxAmountOfTokensA, uint256 amountOfTokensB) internal virtual;

    function _getPoolBalances() internal view returns (uint256, uint256) {
        uint256 balanceOfTokenA = ERC20(tokenA).balanceOf(address(this));
        uint256 normalizedBalanceA = balanceOfTokenA.mul(10**(uint256(WAD_DECIMALS - tokenADecimals)));

        uint256 balanceOfTokenB = ERC20(tokenB).balanceOf(address(this));
        uint256 normalizedBalanceB = balanceOfTokenB.mul(10**(uint256(WAD_DECIMALS - tokenBDecimals)));

        return (normalizedBalanceA, normalizedBalanceB);
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
    ) internal view returns (Mult memory multipliers) {
        uint256 mAA = (min(deamortizedTokenABalance.mul(fImpOpening), totalTokenA)).div(deamortizedTokenABalance);
        uint256 mBB = (min(deamortizedTokenBBalance.mul(fImpOpening), totalTokenB)).div(deamortizedTokenBBalance);
        uint256 mAB = totalTokenB.sub(mBB.mul(deamortizedTokenBBalance)).div(deamortizedTokenABalance);
        uint256 mBA = totalTokenA.sub(mAA.mul(deamortizedTokenABalance)).div(deamortizedTokenBBalance);

        multipliers = Mult(mAA, mBB, mAB, mBA);
    }

    function _getAvaiableForRescueAmounts(
        uint256 userTokenABalance,
        uint256 userTokenBBalance,
        uint256 userImp,
        Mult memory m
    ) internal pure returns (uint256, uint256) {
        uint256 userMAB = userTokenBBalance.mul(m.AB).div(userImp);
        uint256 userMBB = userTokenBBalance.mul(m.BB).div(userImp);
        uint256 userMAA = userTokenABalance.mul(m.AA).div(userImp);
        uint256 userMBA = userTokenABalance.mul(m.BA).div(userImp);

        uint256 tokenAAvaiableForRescue = userMAA.add(userMBA);
        uint256 tokenBAvaiableForRescue = userMBB.add(userMAB);
        return (tokenAAvaiableForRescue, tokenBAvaiableForRescue);
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

    /**
     * @dev Returns the smallest of two numbers.
     */
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function _getABPrice() internal virtual returns (uint256);

    function _onTrade(TradeDetails memory tradeDetails) internal virtual;

    function _getTradeDetails(uint256 amountIn) internal virtual returns (TradeDetails memory);
}
