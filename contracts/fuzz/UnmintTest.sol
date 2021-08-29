// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "../../node_modules/@openzeppelin/contracts/math/SafeMath.sol";

contract UnmintTest {
    using SafeMath for uint256;

    uint256 public strikePrice;
    uint256 public strikeReserves;
    uint256 public totalSupply;
    uint256 public underlyingAssetDecimals;

    constructor(uint256 _strikePrice, uint256 _decimals) public {
        require(_strikePrice > 0);
        require(_decimals > 0 && _decimals < 24);
        strikePrice = _strikePrice;
        underlyingAssetDecimals = _decimals;
    }

    function mint(uint256 amount) public {
        uint256 strikeAmount = amount.mul(strikePrice).div(10**underlyingAssetDecimals);
        require(strikeAmount > 0, "PodOption: amount of options is too low");
        totalSupply = totalSupply.add(amount);
        strikeReserves = strikeReserves.add(strikeAmount);
    }

    function echidna_strikeReserves() public view returns (bool) {
        uint256 strikeAssetDeposited = totalSupply.mul(strikePrice).div(10**underlyingAssetDecimals);

        return strikeReserves >= strikeAssetDeposited;
    }
}
