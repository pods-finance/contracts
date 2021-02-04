// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./IPodOption.sol";
import "./IConfigurationManager.sol";

interface IOptionBuilder {
    function buildOption(
        string memory _name,
        string memory _symbol,
        IPodOption.ExerciseType _exerciseType,
        address _underlyingAsset,
        address _strikeAsset,
        uint256 _strikePrice,
        uint256 _expiration,
        uint256 _exerciseWindowSize,
        IConfigurationManager _configurationManager
    ) external returns (IPodOption);
}
