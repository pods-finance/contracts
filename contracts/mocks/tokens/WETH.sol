// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../interfaces/IWETH.sol";

contract WETH is IWETH, ERC20 {
    constructor() public ERC20("Wrapped Ether", "WETH") {}

    function deposit() public payable override {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) public override {
        _burn(msg.sender, amount);
        Address.sendValue(msg.sender, amount);
        emit Withdrawal(msg.sender, amount);
    }
}
