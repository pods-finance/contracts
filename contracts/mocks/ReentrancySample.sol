pragma solidity 0.6.12;

import "../lib/ReentrancyGuard.sol";

contract ReentrancySample is ReentrancyGuard {
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
