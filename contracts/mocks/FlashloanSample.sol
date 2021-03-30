// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "../lib/FlashloanProtection.sol";

contract FlashloanSample is FlashloanProtection {
    uint256 public interactions = 0;

    function one() public {
        _nonReentrant();
        interactions += 1;
    }

    function two() public {
        _nonReentrant();
        interactions += 1;
    }
}
