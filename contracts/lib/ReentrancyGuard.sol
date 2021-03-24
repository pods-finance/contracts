pragma solidity 0.6.12;

contract ReentrancyGuard {
    mapping(address => uint256) sessions;

    /**
     * @dev Prevents an address from calling more than one function that contains this
     * function in the same block
     */
    function _nonReentrant() internal {
        uint256 lastEnterBlock = sessions[tx.origin];
        require(lastEnterBlock != block.number, "ReentrancyGuard: reentrant call");
        sessions[tx.origin] = block.number;
    }
}
