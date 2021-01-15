// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface IConfigurationManager {
    function setEmergencyStop(address emergencyStop) external;

    function setPricingMethod(address pricingMethod) external;

    function getEmergencyStop() external view returns (address);

    function getPricingMethod() external view returns (address);
}
