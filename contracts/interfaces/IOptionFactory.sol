// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "./IPodPut.sol";

interface IOptionFactory {
    function createOption(
        string calldata name,
        string calldata symbol,
        uint8 optionType,
        address underlyingAsset,
        address strikeAsset,
        uint256 strikePrice,
        uint256 expirationDate
    ) external returns (IPodPut podPut, address exchangeAddress);

    function createInterestBearingOption(
        string calldata name,
        string calldata symbol,
        uint8 optionType,
        address underlyingAsset,
        address strikeAsset,
        uint256 strikePrice,
        uint256 expirationDate
    ) external returns (IPodPut aPodPut, address exchangeAddress);
}
