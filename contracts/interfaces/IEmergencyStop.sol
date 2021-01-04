// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface IEmergencyStop {
    function isStopped(address target) external view returns (bool);

    function stop(address target) external;

    function resume(address target) external;
}
