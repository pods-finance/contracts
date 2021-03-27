// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../interfaces/IConfigurationManager.sol";
import "../interfaces/ICapProvider.sol";

/**
 * @title CappedPool
 * @author Pods Finance
 *
 * @notice Controls a maximum cap for a guarded release
 */
abstract contract CappedPool {
    using SafeMath for uint256;

    IConfigurationManager private immutable _configurationManager;

    constructor(IConfigurationManager configurationManager) public {
        _configurationManager = configurationManager;
    }

    /**
     * @dev Modifier to stop transactions that exceed the cap
     */
    modifier capped(address token, uint256 amountOfLiquidity) {
        uint256 cap = capSize();
        uint256 poolBalance = IERC20(token).balanceOf(address(this));

        if (cap > 0) {
            require(poolBalance.add(amountOfLiquidity) <= cap, "CappedPool: amount exceed cap");
        }
        _;
    }

    /**
     * @dev Get the cap size
     */
    function capSize() public view returns (uint256) {
        ICapProvider capProvider = ICapProvider(_configurationManager.getCapProvider());
        return capProvider.getCap(address(this));
    }
}
