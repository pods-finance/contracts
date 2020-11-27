// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "./IPodOption.sol";

interface IOptionBuilder {
    function buildOption(
        string calldata name,
        string calldata symbol,
        address underlyingAsset,
        address strikeAsset,
        uint256 strikePrice,
        uint256 expirationDate,
        uint256 exerciseWindowSize
    ) external returns (address);
}
