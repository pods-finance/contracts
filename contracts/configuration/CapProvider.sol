// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/ICapProvider.sol";

/**
 * @title Cap
 * @author Pods Finance
 * @notice Keeps the addresses of capped contracts, so contracts can be aware
 * of the max amount allowed of some asset inside the contract
 */
contract CapProvider is ICapProvider, Ownable {
    mapping(address => uint256) private _addresses;

    event SetCap(address indexed target, uint256 value);

    /**
     * @dev Defines a cap value to a contract
     * @param target The contract address
     * @param value Cap amount
     */
    function setCap(address target, uint256 value) external override onlyOwner {
        _addresses[target] = value;
        emit SetCap(target, value);
    }

    /**
     * @dev Get the value of a defined cap
     * @param target The contract address
     */
    function getCap(address target) external override view returns (uint256) {
        return _addresses[target];
    }
}