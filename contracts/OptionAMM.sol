pragma solidity ^0.6.8;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract OptionAMM {
    using SafeMath for uint256;

    uint256 currentSigma;
    address option;
    address stableAsset;
    address underlyingAsset;
    uint256 expiration;
    uint256 strikePrice;
    uint256 deamortizedOptionBalance;
    uint256 deamortizedStableBalance;
    uint256 fImp;
    uint256 riskFree = 0;

    struct UserBalance {
        uint256 optionBalance;
        uint256 stableBalance;
        uint256 fImp;
    }

    mapping(address => UserBalance) balances;

    /** Events */
    event AddLiquidity(address indexed caller, uint256 amountOfStable, uint256 amountOfOptions);
    event RemoveLiquidity(address indexed caller, uint256 amountOfStable, uint256 amountOfOptions);
    event BuyExact(address indexed caller, uint256 amount);
    event SellExact(address indexed caller, uint256 amount);

    constructor(address _optionAddress, address _stableAsset) public {
        stableAsset = _stableAsset;
        option = _optionAddress;
    }

    function addLiquidity(uint256 amountOfStable, uint256 amountOfOptions) public {
        // 2) Calculate Totals
        uint256 totalStable = IERC20(stableAsset).balanceOf(address(this));
        uint256 totalOptions = IERC20(option).balanceOf(address(this));

        bool isInitialLiquidity = totalStable == 0 || totalOptions == 0;
        uint256 fImpOpening;

        if (isInitialLiquidity) {
            require(amountOfStable > 0 && amountOfOptions > 0, "You should add both tokens on first liquidity");

            fImpOpening = 1;
            deamortizedOptionBalance = amountOfOptions;
            deamortizedStableBalance = amountOfStable;
        } else {
            uint256 spotPrice = CHAINLINK(underlyingAsset);
            // 1. new Calculated BS Price => new spot, new time, last sigma
            uint256 timeToMaturity = expiration - block.timestamp;
            uint256 newPrice = BS(spotPrice, strikePrice, currentSigma, timeToMaturity, riskFree);

            // 2) FImpOpening(balanceOf(A), balanceOf(B), amortizedBalance(A), amortizedBalance(B))
            // fImp = (totalOptions*spotPrice + totalStable) / (deamortizedOption*spotPrice + deamortizedStable)
            fImpOpening = totalOptions.mul(spotPrice).add(totalStable).div(
                deamortizedOptionBalance.mul(spotPrice).add(deamortizedStableBalance)
            );

            // 4) Update demortizedBalances;
            // deamortizedBalance = deamortizedBalance + amount/fImpOpening
            deamortizedOptionBalance = deamortizedOptionBalance.add(amountOfOptions.div(fImpOpening));
            deamortizedStableBalance = deamortizedStableBalance.add(amountOfStable.div(fImpOpening));
        }

        // 3) Update User properties (BalanceUserA, BalanceUserB, fImpMoment)
        UserBalance memory userBalance = UserBalance(amountOfOptions, amountOfStable, fImpOpening);
        balances[msg.sender] = userBalance;

        // 5. transferFrom(amountA) / transferFrom(amountB) = > Already updates the new balanceOf(a) / balanceOf(b)
        require(
            IERC20(option).transferFrom(msg.sender, address(this), amountOfOptions),
            "Could not transfer option tokens from caller"
        );

        require(
            IERC20(stableAsset).transferFrom(msg.sender, address(this), amountOfStable),
            "Could not transfer stable tokens from caller"
        );

        emit AddLiquidity(msg.sender, amountOfOptions, amountOfStable);
    }

    function removeLiquidity(uint256 amountOfStable, uint256 amountOfOptions) public {
        // 2) Calculate Totals
        uint256 totalStable = IERC20(stableAsset).balanceOf(address(this));
        uint256 totalOptions = IERC20(option).balanceOf(address(this));

        uint256 spotPrice = CHAINLINK(underlyingAsset);
        // 1. new Calculated BS Price => new spot, new time, last sigma
        uint256 timeToMaturity = expiration - block.timestamp;
        uint256 newPrice = BS(spotPrice, strikePrice, currentSigma, timeToMaturity, riskFree);

        // 2) FImpOpening(balanceOf(A), balanceOf(B), amortizedBalance(A), amortizedBalance(B))
        // fImp = (totalOptions*spotPrice + totalStable) / (deamortizedOption*spotPrice + deamortizedStable)
        uint256 fImpOpening = totalOptions.mul(spotPrice).add(totalStable).div(
            deamortizedOptionBalance.mul(spotPrice).add(deamortizedStableBalance)
        );

        // 3) Calculate rescue multipliers

        (uint256 optionAmountAvaiableToWithdraw, uint256 stableAmountAvaiableToWithdraw) = calculateAvaiableAmount(
            deamortizedStableBalance,
            deamortizedOptionBalance,
            totalStable,
            totalOptions,
            amountOfOptions,
            amountOfStable,
            fImpOpening,
            balances[msg.sender].fImp
        );

        require(
            amountOfStable < stableAmountAvaiableToWithdraw && amountOfOptions < optionAmountAvaiableToWithdraw,
            "You cant remove those quantities"
        );

        // 4) Update users properties
        balances[msg.sender].optionBalance = balances[msg.sender].optionBalance.sub(amountOfOptions);
        balances[msg.sender].stableBalance = balances[msg.sender].optionBalance.sub(amountOfStable);
        // 5) Generate impact on multipliers

        //6) Update deamortizedBalances
        deamortizedOptionBalance = deamortizedOptionBalance.sub(amountOfOptions.div(fImpOpening));
        deamortizedStableBalance = deamortizedStableBalance.sub(amountOfStable.div(fImpOpening));

        // 5. transferFrom(amountA) / transferFrom(amountB) = > Already updates the new balanceOf(a) / balanceOf(b)
        require(IERC20(option).transfer(msg.sender, amountOfOptions), "Could not transfer option tokens from caller");

        require(
            IERC20(stableAsset).transfer(msg.sender, amountOfStable),
            "Could not transfer stable tokens from caller"
        );

        emit RemoveLiquidity(msg.sender, amountOfOptions, amountOfStable);
    }

    function buyExact(
        uint256 maxPayedStable,
        uint256 amount,
        uint256 sigmaInitialGuess
    ) public {
        // 1) Calculate BS
        // 1a) Consult spotPrice Oracle
        uint256 spotPrice = CHAINLINK(underlyingAsset); //
        uint256 timeToMaturity = expiration - block.timestamp; //expiration or endOfExerciseWindow
        uint256 newPrice = BS(spotPrice, strikePrice, currentSigma, timeToMaturity, riskFree); //riskFree = 0

        // 2) Calculate Totals
        uint256 totalStable = IERC20(stableAsset).balanceOf(address(this));
        uint256 totalOptions = IERC20(option).balanceOf(address(this));

        // 2a) Calculate Avaiable Pools
        uint256 poolOptions = min(totalOptions, totalStable.div(newPrice));
        uint256 poolStable = min(totalStable, totalOptions.mul(newPrice));

        // 2c) Product Constant
        uint256 productConstant = poolOptions.mul(poolStable);

        // 3. Calculate Paying/Receiving money => [(2c) / ((2) +/- amount) - (2b)]
        uint256 stableToTransfer = productConstant.div(poolOptions.sub(amount)).sub(poolStable);

        //3b. Calculate price per option => (3)/ amount
        uint256 targetPrice = stableToTransfer.div(amount);

        // 4. Update currentSigma
        currentSigma = findNextSigma(targetPrice, sigmaInitialGuess, currentSigma, newPrice);

        // 5. transfer assets
        require(IERC20(stableAsset).transferFrom(msg.sender, address(this), stableToTransfer), "not transfered asset");

        require(IERC20(option).transfer(msg.sender, amount), "not transfered asset");

        emit BuyExact(msg.sender, amount);
    }

    function calculateAvaiableAmount(
        uint256 deamortizedStableBalance,
        uint256 deamortizedOptionBalance,
        uint256 totalStable,
        uint256 totalOptions,
        uint256 amountOfOptions,
        uint256 amountOfStable,
        uint256 fImpOpening,
        uint256 depositedImp
    ) internal view returns (uint256, uint256) {
        uint256 auxStableStable = (min(deamortizedStableBalance.mul(fImpOpening), totalStable)).div(
            deamortizedStableBalance
        );

        uint256 auxOptionOption = (min(deamortizedOptionBalance.mul(fImpOpening), totalOptions)).div(
            deamortizedOptionBalance
        );

        uint256 auxStableOption = totalOptions.sub(auxOptionOption.mul(deamortizedOptionBalance)).div(
            deamortizedStableBalance
        );

        uint256 auxOptionStable = totalStable.sub(auxStableStable.mul(deamortizedStableBalance)).div(
            deamortizedOptionBalance
        );

        uint256 MStableStable = amountOfStable.mul(auxStableStable).div(depositedImp);
        uint256 MStableOption = amountOfStable.mul(auxStableOption).div(depositedImp);
        uint256 MOptionStable = amountOfOptions.mul(auxOptionStable).div(depositedImp);
        uint256 MOptionOption = amountOfOptions.mul(auxOptionOption).div(depositedImp);

        return (MOptionOption.add(MStableOption), MStableStable.add(MOptionStable));
    }

    function BS(
        uint256 spotPrice,
        uint256 strikePrice,
        uint256 sigma,
        uint256 daysRemaining,
        uint256 riskFree
    ) public view returns (uint256) {
        return 2;
    }

    function CHAINLINK(address asset) public view returns (uint256 price) {
        price = 2;
    }

    function findNextSigma(
        uint256 targetPrice,
        uint256 sigmaInitialGuess,
        uint256 currentSigma,
        uint256 lastPrice
    ) public view returns (uint256) {
        return 2;
    }

    /**
     * @dev Returns the smallest of two numbers.
     */
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
