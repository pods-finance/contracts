// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./ModuleStorage.sol";
import "../interfaces/IConfigurationManager.sol";

/**
 * @title ConfigurationManager
 * @author Pods Finance
 * @notice Allows contracts to read protocol-wide configuration modules
 */
contract ConfigurationManager is IConfigurationManager, ModuleStorage, Ownable {
    bytes32 private constant EMERGENCY_STOP = "EMERGENCY_STOP";
    bytes32 private constant PRICING_METHOD = "PRICING_METHOD";

    function setEmergencyStop(address emergencyStop) external override onlyOwner {
        _setModule(EMERGENCY_STOP, emergencyStop);
    }

    function setPricingMethod(address pricingMethod) external override onlyOwner {
        _setModule(PRICING_METHOD, pricingMethod);
    }

    function getEmergencyStop() external override view returns (address) {
        return getModule(EMERGENCY_STOP);
    }

    function getPricingMethod() external override view returns (address) {
        return getModule(PRICING_METHOD);
    }
}
