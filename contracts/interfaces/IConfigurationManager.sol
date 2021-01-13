// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface IConfigurationManager {
    function setEmergencyStop(address emergencyStop) external;

    function getEmergencyStop() external view returns (address);
}
