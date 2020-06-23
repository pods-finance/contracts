// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "./ConstantAddressesMainnet.sol";
import "./ConstantAddressesKovan.sol";

contract ConstantAddresses is ConstantAddressesMainnet {
    address public constant EMPTY_ADDRESS = 0x0000000000000000000000000000000000000000;
}
