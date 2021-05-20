// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IIVProvider.sol";

/**
 * @title IVProvider
 * @author Pods Finance
 * @notice Storage of implied volatility oracles
 */
contract IVProvider is IIVProvider, Ownable {
    mapping(address => IVData) private _answers;

    mapping(address => uint256) private _lastIds;

    address public updater;

    modifier isUpdater() {
        require(msg.sender == updater, "IVProvider: sender must be an updater");
        _;
    }

    function getIV(address option)
        external
        override
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint8
        )
    {
        IVData memory data = _answers[option];
        return (data.roundId, data.updatedAt, data.answer, data.decimals);
    }

    function updateIV(
        address option,
        uint256 answer,
        uint8 decimals
    ) external override isUpdater {
        uint256 lastRoundId = _lastIds[option];
        uint256 roundId = ++lastRoundId;

        _lastIds[option] = roundId;
        _answers[option] = IVData(roundId, block.timestamp, answer, decimals);

        emit UpdatedIV(option, roundId, block.timestamp, answer, decimals);
    }

    function setUpdater(address _updater) external override onlyOwner {
        updater = _updater;
        emit UpdaterSet(msg.sender, updater);
    }
}
