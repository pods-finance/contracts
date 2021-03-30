// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IEmergencyStop.sol";

/**
 * @title EmergencyStop
 * @author Pods Finance
 * @notice Keeps the addresses of stopped contracts, so contracts can be aware
 * of which functions to interrupt temporarily
 */
contract EmergencyStop is IEmergencyStop, Ownable {
    mapping(address => bool) private _addresses;

    event Stopped(address indexed target);
    event Resumed(address indexed target);

    /**
     * @dev Signals that the target should now be considered as stopped
     * @param target The contract address
     */
    function stop(address target) external override onlyOwner {
        _addresses[target] = true;
        emit Stopped(target);
    }

    /**
     * @dev Signals that the target should now be considered as fully functional
     * @param target The contract address
     */
    function resume(address target) external override onlyOwner {
        require(_addresses[target], "EmergencyStop: target is not stopped");
        _addresses[target] = false;
        emit Resumed(target);
    }

    /**
     * @dev Checks if a contract should be considered as stopped
     * @param target The contract address
     */
    function isStopped(address target) external override view returns (bool) {
        return _addresses[target];
    }
}
