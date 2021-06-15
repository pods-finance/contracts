// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "../PodPut.sol";
import "../../interfaces/IAaveRewarder.sol";

/**
 * @title WPodPut
 * @author Pods Finance
 *
 * @notice Represents a tokenized Put option series that handles and distributes liquidity
 * mining rewards to minters (sellers) proportionally to their amount of shares
 *
 */
contract AavePodPut is PodPut {
    event WithdrawWithRewards(
        address indexed minter,
        uint256 strikeAmount,
        uint256 underlyingAmount,
        uint256 rewardAmount
    );
    address public immutable rewardAsset;
    IAaveRewarder public immutable rewardContract;

    constructor(
        string memory name,
        string memory symbol,
        IPodOption.ExerciseType exerciseType,
        address underlyingAsset,
        address strikeAsset,
        uint256 strikePrice,
        uint256 expiration,
        uint256 exerciseWindowSize,
        IConfigurationManager configurationManager,
        address _rewardAsset,
        address _rewardContract
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
    {
        rewardAsset = _rewardAsset;
        rewardContract = _rewardContract;
    } // solhint-disable-line no-empty-blocks

    // /**
    //  * @notice Unlocks collateral by burning option tokens.
    //  *
    //  * @dev In case of American options where exercise can happen before the expiration, caller
    //  * may receive a mix of underlying asset and strike asset.
    //  *
    //  * Options can only be burned while the series is NOT expired.
    //  *
    //  * @param amountOfOptions The amount option tokens to be burned
    //  */
    // function unmintWithRewards(uint256 amountOfOptions) external override tradeWindow {
    //     (uint256 strikeToSend, uint256 underlyingToSend, , uint256 underlyingReserves) = _burnOptions(
    //         amountOfOptions,
    //         msg.sender
    //     );
    //     require(strikeToSend > 0, "WPodPut: amount of options is too low");

    //     // Sends strike asset
    //     IERC20(strikeAsset()).safeTransfer(msg.sender, strikeToSend);

    //     // Sends the underlying asset if the option was exercised
    //     if (underlyingReserves > 0) {
    //         require(underlyingToSend > 0, "WPodPut: amount of options is too low");
    //         IWETH(underlyingAsset()).withdraw(underlyingToSend);
    //         Address.sendValue(msg.sender, underlyingToSend);
    //     }

    //     emit Unmint(msg.sender, amountOfOptions, strikeToSend, underlyingToSend);
    // }

    /**
     * @notice The current rewardReserves.
     */
    function rewardReserves() external view returns (uint256) {
        return _rewardReserves();
    }

    /**
     * @notice After series expiration in case of American or after exercise window for European,
     * allow minters who have locked their strike asset tokens to withdraw them proportionally
     * to their minted options.
     *
     * @dev If assets had been exercised during the option series the minter may withdraw
     * the exercised assets or a combination of exercised and strike asset tokens.
     */
    function withdrawWithRewards() external withdrawWindow {
        // 1) claim
        _claimReward();
        // 2) calculate rewards to send
        uint256 ownerShares = shares[msg.sender];
        uint256 rewardsToSend = ownerShares.mul(_rewardReserves()).div(totalShares);

        (uint256 strikeToSend, uint256 underlyingToSend) = _withdraw();

        IERC20(strikeAsset()).safeTransfer(msg.sender, strikeToSend);

        if (underlyingToSend > 0) {
            IERC20(underlyingAsset()).safeTransfer(msg.sender, underlyingToSend);
        }

        if (rewardsToSend > 0) {
            IERC20(rewardAsset()).safeTransfer(msg.sender, rewardsToSend);
        }

        emit WithdrawWithRewards(msg.sender, strikeToSend, underlyingToSend, rewardsToSend);
    }

    function _rewardReserves() internal view returns (uint256) {
        return IERC20(rewardAsset()).balanceOf(address(this));
    }

    function _claimReward(address asset) internal {
        uint256 amountToClaim = rewardContract.getUserUnclaimedRewards(address(this));

        rewardContract.claimRewards([asset], amountToClaim, address(this));
    }
}
