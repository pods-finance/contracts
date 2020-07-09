// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

interface IOptionFactory {
    function createOption(
        string calldata name,
        string calldata symbol,
        uint8 optionType,
        address underlyingAsset,
        address strikeAsset,
        uint256 strikePrice,
        uint256 expirationDate
    ) external returns (address PodPut, address exchangeAddress);

    function createInterestBearingOption(
        string calldata name,
        string calldata symbol,
        uint8 optionType,
        address underlyingAsset,
        address strikeAsset,
        uint256 strikePrice,
        uint256 expirationDate
    ) external returns (address aPodPut, address exchangeAddress);
}
