// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./MintableERC20.sol";

/**
 * @title ERC20Mintable
 * @dev ERC20 with mint function
 */
contract MintableInterestBearing is MintableERC20 {
    uint256 lastUpdate;

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals
    ) public MintableERC20(name, symbol, decimals) {
        lastUpdate = block.number;
    }

    function earnInterest(address owner) public {
        uint256 currentBalance = this.balanceOf(owner);
        uint256 earnedInterest = currentBalance.div(uint256(100));
        _mint(owner, earnedInterest);
    }
}
