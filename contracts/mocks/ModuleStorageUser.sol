// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "../configuration/ModuleStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ModuleStorageUser is ModuleStorage, Ownable {
    bytes32 private constant TOKEN_BURNER = "TOKEN_BURNER";

    function setTokenBurner(address newTokenBurner) external onlyOwner {
        _setModule(TOKEN_BURNER, newTokenBurner);
    }
}
