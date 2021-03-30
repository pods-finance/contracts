// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

interface IOptionAMMFactory {
    function createPool(
        address _optionAddress,
        address _stableAsset,
        uint256 _initialSigma
    ) external returns (address);

    function getPool(address _optionAddress) external view returns (address);
}
