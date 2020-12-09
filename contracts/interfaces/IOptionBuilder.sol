// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "../options/PodOption.sol";

interface IOptionBuilder {
    function buildOption(
        string memory _name,
        string memory _symbol,
        IPodOption.ExerciseType _exerciseType,
        address _underlyingAsset,
        address _strikeAsset,
        uint256 _strikePrice,
        uint256 _expiration,
        uint256 _exerciseWindowSize
    ) external returns (PodOption);
}
