// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title ERC20Mintable
 * @dev ERC20 with mint function
 */
contract MintableERC20 is ERC20 {
    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals
    ) public ERC20(name, symbol) {
        _setupDecimals(decimals);
    }

    function mint(uint256 amount) public returns (bool) {
        _mint(msg.sender, amount);
        return true;
    }

    function burn(uint256 amount) public returns(bool) {
        _burn(msg.sender, amount);
        return true;
    }
}
