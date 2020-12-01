// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        uint256 amountToMint
    ) public ERC20(_name, _symbol) {
        _setupDecimals(_decimals);
        _mint(msg.sender, amountToMint);
    }
}
