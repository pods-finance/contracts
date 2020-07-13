// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "../interfaces/IERC20Mintable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

interface LendingPool {
    function deposit(
        address _reserve,
        uint256 _amount,
        uint16 _referralCode
    ) external;
}

contract FaucetKovan {
    using SafeMath for uint256;

    function getFaucet() external {
        address aaveUSDCAddress = 0xe22da380ee6B445bb8273C81944ADEB6E8450422;
        address aUSDCAddress = 0x02F626c6ccb6D2ebC071c068DC1f02Bf5693416a;
        address lendingPoolAddress = 0x580D4Fdc4BF8f9b5ae2fb9225D584fED4AD5375c;
        address lendingPoolCoreAddress = 0x95D1189Ed88B380E319dF73fF00E479fcc4CFa45;
        address kovanWBTCAddress = 0x351a448d49C8011D293e81fD53ce5ED09F433E4c;

        ERC20Mintable usdc = ERC20Mintable(aaveUSDCAddress);
        ERC20Mintable wbtc = ERC20Mintable(kovanWBTCAddress);

        uint256 usdcAskedAmount = 30000;
        uint8 usdcDecimals = usdc.decimals();
        uint256 mintedUsdcAmount = usdcAskedAmount.mul(10**uint256(usdcDecimals));
        // Mint USDC
        usdc.mint(mintedUsdcAmount);
        usdc.transfer(msg.sender, mintedUsdcAmount.div(2));

        // Mint aUSDC
        usdc.approve(lendingPoolCoreAddress, mintedUsdcAmount.div(2));
        LendingPool(lendingPoolAddress).deposit(aaveUSDCAddress, mintedUsdcAmount.div(2), 0);

        // send Aave aUSDC
        ERC20Mintable(aUSDCAddress).transfer(msg.sender, mintedUsdcAmount.div(2));

        uint256 askedAmount = 100;
        uint8 wbtcDecimals = wbtc.decimals();
        uint256 mintedWbtcAmount = askedAmount.mul(10**uint256(wbtcDecimals));
        // Mint WBTC
        wbtc.mint(mintedWbtcAmount);
        wbtc.transfer(msg.sender, mintedWbtcAmount);
    }
}
