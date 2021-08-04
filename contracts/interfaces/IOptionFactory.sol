// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "./IPodOption.sol";

interface IOptionFactory {
    function createOption(
        string memory _name,
        string memory _symbol,
        IPodOption.OptionType _optionType,
        IPodOption.ExerciseType _exerciseType,
        address _underlyingAsset,
        address _strikeAsset,
        uint256 _strikePrice,
        uint256 _expiration,
        uint256 _exerciseWindowSize,
        bool _isAave
    ) external returns (address);

    function wrappedNetworkTokenAddress() external returns (address);
}
