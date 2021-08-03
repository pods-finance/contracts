// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "../lib/CombinedActionsGuard.sol";

contract FlashloanSample is CombinedActionsGuard {
    uint256 public interactions = 0;

    function one() public {
        _nonCombinedActions();
        interactions += 1;
    }

    function two() public {
        _nonCombinedActions();
        interactions += 1;
    }
}
