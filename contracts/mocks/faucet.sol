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
    address public constant AAVE_USDC_ADDRESS = 0xe22da380ee6B445bb8273C81944ADEB6E8450422;
    address public constant AAVE_DAI_ADDRESS = 0xFf795577d9AC8bD7D90Ee22b6C1703490b6512FD;
    address public constant LENDINGPOOL_CORE_ADDRESS = 0x95D1189Ed88B380E319dF73fF00E479fcc4CFa45;
    LendingPool private _lendingPool = LendingPool(0x580D4Fdc4BF8f9b5ae2fb9225D584fED4AD5375c);
    IERC20Mintable private _usdc = IERC20Mintable(AAVE_USDC_ADDRESS);
    IERC20Mintable private _dai = IERC20Mintable(AAVE_DAI_ADDRESS);
    IERC20Mintable private _wbtc = IERC20Mintable(0x351a448d49C8011D293e81fD53ce5ED09F433E4c);
    IERC20Mintable private _ausdc = IERC20Mintable(0x02F626c6ccb6D2ebC071c068DC1f02Bf5693416a);
    IERC20Mintable private _adai = IERC20Mintable(0x58AD4cB396411B691A9AAb6F74545b2C5217FE6a);

    function getFaucet() external {
        uint256 askedAmount = 30000;
        uint8 usdcDecimals = _usdc.decimals();
        uint8 daiDecimals = _dai.decimals();
        uint256 mintedUsdcAmount = askedAmount.mul(10**uint256(usdcDecimals));
        uint256 mintedDaiAmount = askedAmount.mul(10**uint256(daiDecimals));
        // Mint USDC
        _usdc.mint(mintedUsdcAmount);
        _dai.mint(mintedDaiAmount);
        _usdc.transfer(msg.sender, mintedUsdcAmount.div(2));
        _dai.transfer(msg.sender, mintedDaiAmount.div(2));

        // Mint aUSDC
        _usdc.approve(LENDINGPOOL_CORE_ADDRESS, mintedUsdcAmount.div(2));
        _dai.approve(LENDINGPOOL_CORE_ADDRESS, mintedDaiAmount.div(2));
        _lendingPool.deposit(AAVE_USDC_ADDRESS, mintedUsdcAmount.div(2), 0);
        _lendingPool.deposit(AAVE_DAI_ADDRESS, mintedDaiAmount.div(2), 0);

        // send Aave aUSDC
        _ausdc.transfer(msg.sender, mintedUsdcAmount.div(2));
        _adai.transfer(msg.sender, mintedDaiAmount.div(2));

        uint256 askedWbtcAmount = 100;
        uint8 wbtcDecimals = _wbtc.decimals();
        uint256 mintedWbtcAmount = askedWbtcAmount.mul(10**uint256(wbtcDecimals));
        // Mint WBTC
        _wbtc.mint(mintedWbtcAmount);
        _wbtc.transfer(msg.sender, mintedWbtcAmount);
    }
}
