pragma solidity 0.6.12;

library Conversion {
    /**
     * @notice Parses the address represented by an uint
     */
    function parseAddressFromUint(uint256 x) external pure returns (address) {
        bytes memory data = new bytes(32);
        assembly {
            mstore(add(data, 32), x)
        }
        return abi.decode(data, (address));
    }
}
