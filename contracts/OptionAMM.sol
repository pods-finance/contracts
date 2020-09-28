pragma solidity ^0.6.8;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./interfaces/IPriceProvider.sol";
// import "../interfaces/IBlackScholes.sol";
import "./interfaces/IPodOption.sol";

contract BS {
    function getPutPrice(
        uint256 spotPrice,
        uint256 strikePrice,
        uint256 sigma,
        uint256 daysRemaining,
        uint256 riskFree
    ) public view returns (uint256) {
        return 2;
    }
}

contract OptionAMM is BS {
    using SafeMath for uint256;

    uint256 constant INITIAL_FIMP = 10**54;

    // Constructor Info
    address public option;
    address public stableAsset;
    IPriceProvider public priceProvider;

    // Option Info
    uint256 public expiration;
    uint256 public strikePrice;
    address public underlyingAsset;

    // Updated by the user
    uint256 public currentSigma;
    uint256 public deamortizedOptionBalance;
    uint256 public deamortizedStableBalance;
    uint256 public fImp;

    // instead of using local variables, trying to reduce stack too deep
    uint256 totalStable;
    uint256 totalOptions;
    uint256 spotPrice;
    uint256 timeToMaturity;
    uint256 newPrice;
    uint256 fImpOpening;
    uint256 riskFree = 0;

    struct UserBalance {
        uint256 optionBalance;
        uint256 stableBalance;
        uint256 fImp;
    }

    struct Mult {
        uint256 AA;
        uint256 AB;
        uint256 BA;
        uint256 BB;
    }

    mapping(address => UserBalance) public balances;

    /** Events */
    event AddLiquidity(address indexed caller, uint256 amountOfStable, uint256 amountOfOptions);
    event RemoveLiquidity(address indexed caller, uint256 amountOfStable, uint256 amountOfOptions);
    event BuyExact(address indexed caller, uint256 amount);
    event SellExact(address indexed caller, uint256 amount);

    constructor(
        address _optionAddress,
        address _stableAsset,
        address _priceProvider
    ) public {
        stableAsset = _stableAsset;
        option = _optionAddress;
        strikePrice = IPodOption(_optionAddress).strikePrice();
        underlyingAsset = IPodOption(_optionAddress).underlyingAsset();
        expiration = IPodOption(_optionAddress).expiration();
        priceProvider = IPriceProvider(_priceProvider);
    }

    function addLiquidity(uint256 amountOfStable, uint256 amountOfOptions) public {
        // 2) Calculate Totals
        uint256 totalStable = IERC20(stableAsset).balanceOf(address(this));
        uint256 totalOptions = IERC20(option).balanceOf(address(this));

        bool isInitialLiquidity = totalStable == 0 || totalOptions == 0;
        uint256 fImpOpening;

        if (isInitialLiquidity) {
            require(amountOfStable > 0 && amountOfOptions > 0, "You should add both tokens on first liquidity");

            fImpOpening = INITIAL_FIMP;
            deamortizedOptionBalance = amountOfOptions;
            deamortizedStableBalance = amountOfStable;
        } else {
            uint256 spotPrice = priceProvider.getAssetPrice(underlyingAsset);
            // 1. new Calculated BS Price => new spot, new time, last sigma
            uint256 timeToMaturity = expiration - block.timestamp;
            uint256 newPrice = getPutPrice(spotPrice, strikePrice, currentSigma, timeToMaturity, riskFree);

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

        if (balances[msg.sender].fImp != 0) {
            // Update position logic
            // Remove Liquidity + Add liquidty (total) => Economizar bsPrice
        }

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
        totalStable = IERC20(stableAsset).balanceOf(address(this));
        totalOptions = IERC20(option).balanceOf(address(this));

        require(amountOfStable > totalStable && amountOfOptions > totalOptions, "not enough liquidity");

        spotPrice = CHAINLINK(underlyingAsset);
        // 1. new Calculated BS Price => new spot, new time, last sigma
        timeToMaturity = expiration - block.timestamp;
        newPrice = getPutPrice(spotPrice, strikePrice, currentSigma, timeToMaturity, riskFree);

        // 2) FImpOpening(balanceOf(A), balanceOf(B), amortizedBalance(A), amortizedBalance(B))
        // fImp = (totalOptions*spotPrice + totalStable) / (deamortizedOption*spotPrice + deamortizedStable)
        fImpOpening = totalOptions.mul(spotPrice).add(totalStable).div(
            deamortizedOptionBalance.mul(spotPrice).add(deamortizedStableBalance)
        );

        Mult memory multipliers = _getMultipliers(totalStable, totalOptions, fImpOpening);

        (uint256 optionAmountAvaiableForRescue, uint256 stableAmountAvaiableForRescue) = _getAvaiableForRescueAmounts(
            balances[msg.sender].optionBalance,
            balances[msg.sender].stableBalance,
            balances[msg.sender].fImp,
            multipliers
        );

        require(
            amountOfStable < stableAmountAvaiableForRescue && amountOfOptions < optionAmountAvaiableForRescue,
            "Not enough liquidity for rescue"
        );

        (uint256 qA, uint256 qB) = _getNewAmortizedBalances(multipliers, amountOfStable, amountOfOptions);

        // 4) Update users properties
        balances[msg.sender].optionBalance = balances[msg.sender].optionBalance.sub(qA.mul(balances[msg.sender].fImp));
        balances[msg.sender].stableBalance = balances[msg.sender].stableBalance.sub(qB.mul(balances[msg.sender].fImp));
        // 5) Generate impact on multipliers

        //6) Update deamortized Pool Balances
        deamortizedOptionBalance = deamortizedOptionBalance.sub(qA);
        deamortizedStableBalance = deamortizedStableBalance.sub(qB);

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
        spotPrice = CHAINLINK(underlyingAsset); //
        timeToMaturity = expiration - block.timestamp; //expiration or endOfExerciseWindow
        newPrice = getPutPrice(spotPrice, strikePrice, currentSigma, timeToMaturity, riskFree);
        (spotPrice, strikePrice, currentSigma, timeToMaturity, riskFree); //riskFree = 0

        // 2) Calculate Totals
        totalStable = IERC20(stableAsset).balanceOf(address(this));
        totalOptions = IERC20(option).balanceOf(address(this));

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

    function _getMultipliers(
        uint256 totalStable,
        uint256 totalOptions,
        uint256 fImpOpening
    ) internal returns (Mult memory multipliers) {
        uint256 mAA = (min(deamortizedStableBalance.mul(fImpOpening), totalStable)).div(deamortizedStableBalance);
        uint256 mBB = (min(deamortizedOptionBalance.mul(fImpOpening), totalOptions)).div(deamortizedOptionBalance);
        uint256 mAB = totalOptions.sub(mBB.mul(deamortizedOptionBalance)).div(deamortizedStableBalance);
        uint256 mBA = totalStable.sub(mAA.mul(deamortizedStableBalance)).div(deamortizedOptionBalance);

        multipliers = Mult(mAA, mBB, mAB, mBA);
    }

    function _getAvaiableForRescueAmounts(
        uint256 userAmountStable,
        uint256 userAmountOption,
        uint256 userImp,
        Mult memory m
    ) internal returns (uint256, uint256) {
        uint256 MStableOption = userAmountStable.mul(m.AB).div(userImp);
        uint256 MOptionOption = userAmountOption.mul(m.BB).div(userImp);
        uint256 MStableStable = userAmountStable.mul(m.AA).div(userImp);
        uint256 MOptionStable = userAmountOption.mul(m.BA).div(userImp);

        uint256 optionsAvaiableForRescue = MOptionOption.add(MStableOption);
        uint256 stableAvaiableForRescue = MStableStable.add(MOptionStable);
        return (optionsAvaiableForRescue, stableAvaiableForRescue);
    }

    function _getNewAmortizedBalances(
        Mult memory m,
        uint256 amountTokenA,
        uint256 amountTokenB
    ) internal returns (uint256, uint256) {
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
