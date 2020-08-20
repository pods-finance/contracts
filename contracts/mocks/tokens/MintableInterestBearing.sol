// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title ERC20Mintable
 * @dev ERC20 with mint function
 */
contract MintableInterestBearing is ERC20 {
    uint256 lastUpdate;

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals
    ) public ERC20(name, symbol) {
        _setupDecimals(decimals);
        lastUpdate = block.number;
    }

    function mint(uint256 value) public returns (bool) {
        _mint(msg.sender, value);
        return true;
    }

    function earnInterest(address owner) public {
        uint256 currentBalance = this.balanceOf(owner);
        uint256 earnedInterest = currentBalance.div(uint256(100));
        _mint(owner, earnedInterest);
    }
}
