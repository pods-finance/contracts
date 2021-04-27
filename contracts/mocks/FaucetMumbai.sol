// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "../interfaces/IERC20Mintable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

interface LendingPool {
    function deposit(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external;
}

contract FaucetMumbai {
    using SafeMath for uint256;
    LendingPool private _lendingPool = LendingPool(0x9198F13B08E299d85E096929fA9781A1E3d5d827);
    IERC20Mintable private _usdc = IERC20Mintable(0x2058A9D7613eEE744279e3856Ef0eAda5FCbaA7e);
    IERC20Mintable private _dai = IERC20Mintable(0x001B3B4d0F3714Ca98ba10F6042DaEbF0B1B7b6F);
    IERC20Mintable private _weth = IERC20Mintable(0x2f9374157Ef337620b19a720019A6FDB0593d20B);

    function getFaucet() external {
        uint256 askedAmount = 5000;

        // Mint USDC and aUSDC
        uint8 usdcDecimals = _usdc.decimals();
        uint256 mintedUsdcAmount = askedAmount.mul(10**uint256(usdcDecimals));
        _usdc.mint(mintedUsdcAmount);
        _usdc.transfer(msg.sender, mintedUsdcAmount.div(2));
        _usdc.approve(address(_lendingPool), mintedUsdcAmount.div(2));
        _lendingPool.deposit(address(_usdc), mintedUsdcAmount.div(2), msg.sender, 0);

        // Mint DAI and aDAI
        uint8 daiDecimals = _dai.decimals();
        uint256 mintedDaiAmount = askedAmount.mul(10**uint256(daiDecimals));
        _dai.mint(mintedDaiAmount);
        _dai.transfer(msg.sender, mintedDaiAmount.div(2));
        _dai.approve(address(_lendingPool), mintedDaiAmount.div(2));
        _lendingPool.deposit(address(_dai), mintedDaiAmount.div(2), msg.sender, 0);

        // Mint WETH
        uint256 askedWethAmount = 100;
        _weth.mint(askedWethAmount);
        _weth.transfer(msg.sender, askedWethAmount);
    }
}
