// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "./LogarithmLib.sol";

/**
 * IntUtils
 */
library IntUtils {
    /**
     * Square root
     */
    function sqrt(int256 x)
        internal
        pure
        returns (int256 y)
    {
        int256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    /**
     * Fills the right side of number with zeros
     * @param x The value to be coalesced
     * @return Same number with 0s on right side
     */
    function rightPad(int256 x, uint256 decimals)
        internal
        pure
        returns(int256)
    {
        int256 min = int256(10 ** (decimals - 1));
        while (x < min) {
            x = x * 10;
        }
        return x;
    }

    /**
     * Same as natural logarithm but hard-coded for known x values
     * @param x The value to be ln
     * @return ln of x
     */
    function cachedLn(int256 x)
        internal
        pure
        returns(int256)
    {
        return LogarithmLib.ln(x);
    }
}
