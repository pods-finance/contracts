// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "../PodPut.sol";
import "./AaveIncentives.sol";

/**
 * @title AavePodPut
 * @author Pods Finance
 *
 * @notice Represents a tokenized Put option series that handles and distributes liquidity
 * mining rewards to minters (sellers) proportionally to their amount of shares
 */
contract AavePodPut is PodPut, AaveIncentives {
    constructor(
        string memory name,
        string memory symbol,
        IPodOption.ExerciseType exerciseType,
        address underlyingAsset,
        address strikeAsset,
        uint256 strikePrice,
        uint256 expiration,
        uint256 exerciseWindowSize,
        IConfigurationManager configurationManager
    )
        public
        PodPut(
            name,
            symbol,
            exerciseType,
            underlyingAsset,
            strikeAsset,
            strikePrice,
            expiration,
            exerciseWindowSize,
            configurationManager
        )
        AaveIncentives(configurationManager)
    {} // solhint-disable-line no-empty-blocks

    /**
     * @notice Unlocks collateral by burning option tokens.
     *
     * Options can only be burned while the series is NOT expired.
     *
     * @param amountOfOptions The amount option tokens to be burned
     */
    function unmint(uint256 amountOfOptions) external override unmintWindow {
        _claimRewards(_getClaimableAssets());
        uint256 rewardsToSend = (shares[msg.sender].mul(amountOfOptions).div(mintedOptions[msg.sender])).mul(_rewardBalance()).div(totalShares);

        (uint256 strikeToSend, uint256 underlyingToSend) = _unmintOptions(amountOfOptions, msg.sender);
        require(strikeToSend > 0, "AavePodPut: amount of options is too low");

        // Sends strike asset
        IERC20(strikeAsset()).safeTransfer(msg.sender, strikeToSend);

        emit Unmint(msg.sender, amountOfOptions, strikeToSend, underlyingToSend);

        if (rewardsToSend > 0) {
            IERC20(rewardAsset).safeTransfer(msg.sender, rewardsToSend);
            emit RewardsClaimed(msg.sender, rewardsToSend);
        }
    }

    /**
     * @notice After series expiration in case of American or after exercise window for European,
     * allow minters who have locked their strike asset tokens to withdraw them proportionally
     * to their minted options.
     *
     * @dev If assets had been exercised during the option series the minter may withdraw
     * the exercised assets or a combination of exercised and strike asset tokens.
     */
    function withdraw() external override withdrawWindow {
        _claimRewards(_getClaimableAssets());
        uint256 rewardsToSend = shares[msg.sender].mul(_rewardBalance()).div(totalShares);

        (uint256 strikeToSend, uint256 underlyingToSend) = _withdraw();

        IERC20(strikeAsset()).safeTransfer(msg.sender, strikeToSend);

        if (underlyingToSend > 0) {
            IERC20(underlyingAsset()).safeTransfer(msg.sender, underlyingToSend);
        }

        emit Withdraw(msg.sender, strikeToSend, underlyingToSend);

        if (rewardsToSend > 0) {
            IERC20(rewardAsset).safeTransfer(msg.sender, rewardsToSend);
            emit RewardsClaimed(msg.sender, rewardsToSend);
        }
    }

    /**
     * @dev Returns an array of staked assets which may be eligible for claiming rewards
     */
    function _getClaimableAssets() internal view returns (address[] memory) {
        address[] memory assets = new address[](1);
        assets[0] = strikeAsset();

        return assets;
    }
}
