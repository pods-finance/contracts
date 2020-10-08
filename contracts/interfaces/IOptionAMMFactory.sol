// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

interface IOptionAMMFactory {
    function createPool(
        address _optionAddress,
        address _stableAsset,
        address _priceProvider,
        address _priceMethod,
        address _sigma
    ) external returns (address);

    function getPool(address _optionAddress) external view returns (address);
}
