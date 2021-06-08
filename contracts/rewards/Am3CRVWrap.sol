pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract Am3CRVWrap is ERC20 {
    IERC20 token;

    uint256 currentCRate = 2;
    uint256 cRateDecimals = 18;

    struct OriginalDeposit {
        uint256 conversionRate;
        uint256 amount;
    }

    mapping(address => OriginalDeposit) balances;

    constructor(address _token) public ERC20("PodWrapper", "PODWRAP") {
        token = IERC20(_token);
    }

    function mint(uint256 amountOfToken) external {
        uint256 currentConversionRate = _getCurrentConversionRate();
        uint256 amountConverted = amountOfToken * currentConversionRate;
        uint256 originalAmount = balances[msg.sender].amount;
        uint256 originalCRate = balances[msg.sender].conversionRate;
        _mint(msg.sender, amountConverted);

        // Re-add Liquidity
        if (originalAmount > 0) {
            uint256 avgRate = (originalCRate * originalAmount + amountOfToken * currentConversionRate) /
                (originalCRate + currentConversionRate);
            uint256 avgAmount = (originalCRate * originalAmount + amountOfToken * currentConversionRate) /
                (originalAmount + amountOfToken);

            balances[msg.sender] = OriginalDeposit(avgRate, avgAmount);
        } else {
            balances[msg.sender] = OriginalDeposit(currentConversionRate, amountOfToken);
        }
        token.transferFrom(msg.sender, address(this), amountOfToken);
    }

    function unmint(uint256 amount) external {
        uint256 currentConversionRate = _getCurrentConversionRate();
        uint256 originalAmount = balances[msg.sender].amount;
        uint256 originalcRate = balances[msg.sender].conversionRate;
        uint256 amountInOriginalRate;
        uint256 amountInNewRate;

        if (originalAmount > 0) {
            if (originalAmount * originalcRate <= amount) {
                amountInOriginalRate = originalAmount;
                amountInNewRate = (amount - originalAmount * originalcRate) / currentConversionRate;
                balances[msg.sender] = OriginalDeposit(currentConversionRate, 0);
            } else {
                amountInOriginalRate = amount / currentConversionRate;
                balances[msg.sender] = OriginalDeposit(
                    currentConversionRate,
                    originalAmount - amount / currentConversionRate
                );
            }
        } else {
            amountInNewRate = amount / currentConversionRate;
        }
        uint256 totalAmount = amountInNewRate + amountInOriginalRate;
        _burn(msg.sender, amount);
        balances[msg.sender] = OriginalDeposit(currentConversionRate, amount);

        token.transfer(msg.sender, totalAmount);
    }

    function _getCurrentConversionRate() internal view returns (uint256) {
        return currentCRate;
    }

    function setConversionRate(uint256 value) external {
        currentCRate = value;
    }
}
