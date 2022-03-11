// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../interfaces/IAaveIncentivesController.sol";
import "../../interfaces/IConfigurationManager.sol";
import "../../lib/Conversion.sol";

abstract contract AaveIncentives is Conversion {
    address public immutable rewardAsset;
    address public immutable rewardContract;

    event RewardsClaimed(address indexed claimer, uint256 rewardAmount);

    constructor(IConfigurationManager configurationManager) public {
        rewardAsset = _parseAddressFromUint(configurationManager.getParameter("REWARD_ASSET"));
        rewardContract = _parseAddressFromUint(configurationManager.getParameter("REWARD_CONTRACT"));
    }

    /**
     * @notice Gets the current reward claimed
     */
    function _rewardBalance() internal view returns (uint256) {
        return IERC20(rewardAsset).balanceOf(address(this));
    }

    /**
     * @notice Claim pending rewards
     */
    function _claimRewards(address[] memory assets) internal {
        IAaveIncentivesController distributor = IAaveIncentivesController(rewardContract);
        uint256 amountToClaim = distributor.getRewardsBalance(assets, address(this));
        uint256 rewardBalance = _rewardBalance();

        // Don't call "claim" if we have enough to pay option writers
        if (rewardBalance < amountToClaim) {
            distributor.claimRewards(assets, amountToClaim, address(this));
        }
    }

    /**
     * @notice Donate rewards to the option
     */
    function donate(uint256 amount) external {
        require(IERC20(rewardAsset).transferFrom(msg.sender, address(this), amount), "Donation Failed");
    }
}
