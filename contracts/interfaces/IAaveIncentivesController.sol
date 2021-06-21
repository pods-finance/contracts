// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

interface IAaveRewarder {
    function getRewardsBalance(address[] calldata assets, address user) external view returns (uint256);

    function claimRewards(
        address[] calldata assets,
        uint256 amount,
        address to
    ) external returns (uint256);

    function getUserUnclaimedRewards(address user) external view returns (uint256);
}



