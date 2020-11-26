// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "../options/PodOption.sol";

interface IOptionBuilder {
    function buildOption(
        string calldata name,
        string calldata symbol,
        PodOption.ExerciseType exerciseType,
        address underlyingAsset,
        address strikeAsset,
        uint256 strikePrice,
        uint256 expirationDate,
        uint256 exerciseWindowSize
    ) external returns (address);
}
