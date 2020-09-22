pragma solidity ^0.6.8;

contract OptionAMM {
    
    uint256 currentSigma;
    address option;
    address stableAsset;
    uint256 deamortizedOptionBalance;
    uint256 deamortizedStableBalance;
    uint256 riskFree = 0;
    

    struct UserBalance {
        uint256 optionBalance;
        uint256 stableBalance;
        uint256 fImp;
    }

    mapping(address => UserBalance) balances;
    
    constructor(address _optionAddress, address _stableAsset) public {
        stableAsset = _stableAsset;
        option = _optionAddress;
    }
    
    function addLiquidity(uint256 amountOfStable, uint256 amountOfOptions) public {

    if (isInitialLiquidity) {
        // Do another thing
    }
        
    uint spotPrice = CHAINLINK(option.underlyingAsset, option.expiration);
    // 1. new Calculated BS Price => new spot, new time, last sigma
    uint timeToMaturity = deltaTime(block.timestamp, option.expiration); 
    uint newPrice = BS(spotPrice, option.strikePrice, currentSigma, timeToMaturity, riskFree);
    // 2. FImpOpening(balanceOf(A), balanceOf(B), amortizedBalance(A), amortizedBalance(B))	
    // fImp = (P3*B4+Q3)/(N3*B4+O3)
    
    // 2) Calculate Totals
    uint256 totalStable = ERC20(option.strikeAsset).balanceOf(address(this));
    uint256 totalOptions = ERC20(option.address).balanceOf(address(this));
        
    // 2a) Calculate Deamortized Balance
    // (amountOfOptions / fIImpDeposit) - (Rendemption / amountOfStable)
    uint256 deamortizedOptions = (amountOfOptions.div(fImpDeposit)).sub(rendemption.div(amountOfStable));
    uint256 deamortizedStable = Min(totalStable, totalOptions.mul(newPrice));

    // fImp = (P3*B4+Q3)/(N3*B4+O3)
    // fImp = (totalOptions*spotPrice + totalStable) / (deamortizedOption*spotPrice + deamortizedStable)
    // uint256 fImpOpening = (totalOptions.mul(spotPrice).add(totalStable)).div((deamortizedOptions.mul(spotPrice).add(deamortizedStable));

    // 3. Update User properties (BalanceUserA, BalanceUserB, fImpMoment)
    UserBalance memory userBalance = balances[msg.sender];

    // 4. Update deamortizedBalance(A) = deamortizedBalance(atual) + amount(A)/fImpMoment /  e deamortizedBalance(B) = deamortizedBalance(B) + amount(B)/fImpMoment
    
    // 5. transferFrom(amountA) / transferFrom(amountB) = > Already updates the new balanceOf(a) / balanceOf(b)																									
        
    }
    
    function removeLiquidity() public {
        
    }
    
    function buyExact(uint maxPayedStable, uint amount, uint256 sigmaInitialGuess) public {
        // 1) Calculate BS
        // 1a) Consult spotPrice Oracle
        uint spotPrice = CHAINLINK(option.underlyingAsset, option.expiration); //
        uint timeToMaturity = deltaTime(block.timestamp, option.expiration); //expiration or endOfExerciseWindow
        uint newPrice = BS(spotPrice, option.strikePrice, currentSigma, timeToMaturity, riskFree); //riskFree = 0
        
        // 2) Calculate Totals
        uint256 totalStable = ERC20(option.strikeAsset).balanceOf(address(this));
        uint256 totalOptions = ERC20(option.address).balanceOf(address(this));
        
        // 2a) Calculate Avaiable Pools
        uint256 poolOptions = Min(totalOption, totalStable.div(newPrice));
        uint256 poolStable = Min(totalStable, totalOptions.mul(newPrice));
        
        // 2c) Product Constant
        uint256 productConstant = poolOptions.mul(poolStable);
        
        // 3. Calculate Paying/Receiving money => [(2c) / ((2) +/- amount) - (2b)]
        uint256 stableToTransfer = productConstant.div(poolOptions.sub(amount)).sub(poolStable);
        
        //3b. Calculate price per option => (3)/ amount			
        uint256 targetPrice = stableToTransfer.div(amount);
        
        // 4. Update currentSigma
        currentSigma = findNextSigma(targetPrice, sigmaInitialGuess, currentSigma, newPrice);
        
        // 5. transfer assets
        require(ERC20(option.strikeAsset).transferFrom(msg.sender, address(this), stableToTransfer), "not transfered asset");
        
        require(ERC20(option.option).transfer(msg.sender, amount), "not transfered asset");
    }
    
    function sellExact() public {
        
    }
    
    function deltaTime() public {
        
    }
}