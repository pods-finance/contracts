pragma solidity 0.6.12;

import "./FeePool.sol";
import "../interfaces/IFeePool.sol";
import "../interfaces/IFeePoolBuilder.sol";

/**
 * @title FeePoolBuilder
 * @author Pods Finance
 * @notice Builds FeePool
 */
contract FeePoolBuilder is IFeePoolBuilder {
    /**
     * @notice creates a new FeePool Contract
     * @param asset The token in which the fees are collected
     * @param feeValue The base value of fees
     * @param feeDecimals Amount of decimals of feeValue
     * @param owner Owner of the FeePool
     * @return feePool
     */
    function buildFeePool(
        address asset,
        uint256 feeValue,
        uint8 feeDecimals,
        address owner
    ) external override returns (IFeePool) {
        FeePool feePool = new FeePool(asset, feeValue, feeDecimals);
        feePool.transferOwnership(owner);
        return feePool;
    }
}
