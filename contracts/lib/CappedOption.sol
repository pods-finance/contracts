// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/**
 * @title CappedOption
 * @author Pods Finance
 *
 * @notice Controls a maximum cap for a guarded release
 */
abstract contract CappedOption is IERC20 {
    using SafeMath for uint256;

    uint256 private immutable _capSize;

    constructor(uint256 capSize) public {
        _capSize = capSize;
    }

    /**
     * @dev Modifier to stop transactions that exceed the cap
     */
    modifier capped(uint256 amountOfOptions) {
        require(this.totalSupply().add(amountOfOptions) <= _capSize, "CappedOption: amount exceed cap");
        _;
    }

    /**
     * @dev Get the cap size
     */
    function capSize() public view returns (uint256) {
        return _capSize;
    }
}
