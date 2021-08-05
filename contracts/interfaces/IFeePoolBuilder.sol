// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "./IFeePool.sol";
import "./IConfigurationManager.sol";

interface IFeePoolBuilder {
    function buildFeePool(
        IConfigurationManager configurationManager,
        address asset,
        uint256 feeBaseValue,
        uint8 feeDecimals,
        address owner
    ) external returns (IFeePool);
}
