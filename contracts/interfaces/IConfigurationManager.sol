// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface IConfigurationManager {
    function getEmergencyStop() external view returns (address);

    function setEmergencyStop(address emergencyStop) external;
}
