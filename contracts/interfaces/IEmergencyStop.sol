// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

interface IEmergencyStop {
    function stop(address target) external;

    function resume(address target) external;

    function isStopped(address target) external view returns (bool);
}
