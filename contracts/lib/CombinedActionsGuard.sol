// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

contract CombinedActionsGuard {
    mapping(address => uint256) sessions;

    /**
     * @dev Prevents an address from calling more than one function that contains this
     * function in the same block
     */
    function _nonCombinedActions() internal {
        require(sessions[tx.origin] != block.number, "CombinedActionsGuard: reentrant call");
        sessions[tx.origin] = block.number;
    }
}
