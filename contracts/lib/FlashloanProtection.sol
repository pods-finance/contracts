// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

contract FlashloanProtection {
    mapping(address => uint256) sessions;

    /**
     * @dev Prevents an address from calling more than one function that contains this
     * function in the same block
     */
    function _nonReentrant() internal {
        uint256 lastEnterBlock = sessions[tx.origin];
        require(lastEnterBlock != block.number, "FlashloanProtection: reentrant call");
        sessions[tx.origin] = block.number;
    }
}
