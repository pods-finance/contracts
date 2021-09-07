// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.8.4;

import "prb-math/contracts/PRBMathSD59x18.sol";

contract LogarithmUser {
    using PRBMathSD59x18 for int256;

    function ln(int256 x) external pure returns (int256) {
        return x.ln();
    }
}
