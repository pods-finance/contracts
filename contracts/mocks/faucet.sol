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
    address aaveUSDCAddress = 0xe22da380ee6B445bb8273C81944ADEB6E8450422;
    address aaveDAIAddress = 0xFf795577d9AC8bD7D90Ee22b6C1703490b6512FD;
    address aDAIAddress = 0x58AD4cB396411B691A9AAb6F74545b2C5217FE6a;
    address aUSDCAddress = 0x02F626c6ccb6D2ebC071c068DC1f02Bf5693416a;
    address lendingPoolAddress = 0x580D4Fdc4BF8f9b5ae2fb9225D584fED4AD5375c;
    address lendingPoolCoreAddress = 0x95D1189Ed88B380E319dF73fF00E479fcc4CFa45;
    address kovanWBTCAddress = 0x351a448d49C8011D293e81fD53ce5ED09F433E4c;
    LendingPool lendingPool = LendingPool(lendingPoolAddress);
    IERC20Mintable usdc = IERC20Mintable(aaveUSDCAddress);
    IERC20Mintable dai = IERC20Mintable(aaveDAIAddress);
    IERC20Mintable wbtc = IERC20Mintable(kovanWBTCAddress);

    function getFaucet() external {
        uint256 askedAmount = 30000;
        uint8 usdcDecimals = usdc.decimals();
        uint8 daiDecimals = dai.decimals();
        uint256 mintedUsdcAmount = askedAmount.mul(10**uint256(usdcDecimals));
        uint256 mintedDaiAmount = askedAmount.mul(10**uint256(daiDecimals));
        // Mint USDC
        usdc.mint(mintedUsdcAmount);
        dai.mint(mintedDaiAmount);
        usdc.transfer(msg.sender, mintedUsdcAmount.div(2));
        dai.transfer(msg.sender, mintedDaiAmount.div(2));

        // Mint aUSDC
        usdc.approve(lendingPoolCoreAddress, mintedUsdcAmount.div(2));
        dai.approve(lendingPoolCoreAddress, mintedDaiAmount.div(2));
        LendingPool(lendingPoolAddress).deposit(aaveUSDCAddress, mintedUsdcAmount.div(2), 0);
        LendingPool(lendingPoolAddress).deposit(aaveDAIAddress, mintedDaiAmount.div(2), 0);

        // send Aave aUSDC
        IERC20Mintable(aUSDCAddress).transfer(msg.sender, mintedUsdcAmount.div(2));
        IERC20Mintable(aDAIAddress).transfer(msg.sender, mintedDaiAmount.div(2));

        uint256 askedWbtcAmount = 100;
        uint8 wbtcDecimals = wbtc.decimals();
        uint256 mintedWbtcAmount = askedWbtcAmount.mul(10**uint256(wbtcDecimals));
        // Mint WBTC
        wbtc.mint(mintedWbtcAmount);
        wbtc.transfer(msg.sender, mintedWbtcAmount);
    }
}
