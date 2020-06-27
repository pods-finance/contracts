// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

interface IPodFactory {
    function createOption(
        string calldata name,
        string calldata symbol,
        uint8 optionType,
        address underlyingAsset,
        address strikeAsset,
        uint256 strikePrice,
        uint256 expirationDate
    ) external returns (address PodToken, address exchangeAddress);
}
