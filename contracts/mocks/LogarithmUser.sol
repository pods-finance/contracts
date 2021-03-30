// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "../lib/FixidityLib.sol";
import "../lib/LogarithmLib.sol";

contract LogarithmUser {
    using FixidityLib for int256;
    using LogarithmLib for int256;

    function ln(int256 x) external pure returns (int256) {
        return LogarithmLib.ln(x);
    }
}
