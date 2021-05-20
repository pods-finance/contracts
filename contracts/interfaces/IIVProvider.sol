// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

interface IIVProvider {
    struct IVData {
        uint256 roundId;
        uint256 updatedAt;
        uint256 answer;
        uint8 decimals;
    }

    event UpdatedIV(address indexed option, uint256 roundId, uint256 updatedAt, uint256 answer, uint8 decimals);
    event UpdaterSet(address indexed admin, address indexed updater);

    function getIV(address option)
        external
        view
        returns (
            uint256 roundId,
            uint256 updatedAt,
            uint256 answer,
            uint8 decimals
        );

    function updateIV(
        address option,
        uint256 answer,
        uint8 decimals
    ) external;

    function setUpdater(address updater) external;
}
