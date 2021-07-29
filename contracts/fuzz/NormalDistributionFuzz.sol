// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "./NormalDistribution.sol";

contract NormalDistributionFuzz is NormalDistribution {
    function abs_assert(int256 a) public pure {
        uint256 output = _abs(a);
        assert(uint256(a) + output == 0 || uint256(a) - output == 0);
    }

    function echidna_test() public pure returns (bool) {
        return false;
    }
}
