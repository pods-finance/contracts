// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../interfaces/IFeePool.sol";

/**
 * FeePool
 *
 * Represents a pool that manages fee collection.
 * Shares can be created to redeem the collected fees between participants proportionally.
 */
contract FeePool is IFeePool, Ownable {
    using SafeMath for uint256;

    struct Balance {
        uint256 shares;
        uint256 liability;
    }

    mapping(address => Balance) private _balances;
    uint256 private _shares;
    uint256 private _totalLiability;

    uint256 private _feeValue;
    uint8 private _feeDecimals;
    address private _token;

    event FeeUpdated(address token, uint256 newFee, uint8 newFeeDecimals);
    event FeeCollected(address token, uint256 amountCollected);
    event FeeWithdrawn(address token, address to, uint256 amountWithdrawn, uint256 sharesBurned);
    event ShareMinted(address token, address to, uint256 amountMinted);

    constructor(
        address token,
        uint256 feeValue,
        uint8 feeDecimals
    ) public {
        _token = token;
        _feeValue = feeValue;
        _feeDecimals = feeDecimals;
    }

    /**
     * Return the current fee value
     */
    function feeValue() external override view returns (uint256) {
        return _feeValue;
    }

    /**
     * Returns the number of decimals used to represent fees
     */
    function feeDecimals() external override view returns (uint8) {
        return _feeDecimals;
    }

    /**
     * Utility function to calculate fee charges to a given amount
     *
     * @param amount Total transaction amount
     */
    function getCollectable(uint256 amount) external override view returns (uint256) {
        return _getCollectable(amount);
    }

    /**
     * Return balance of an address
     *
     * @param owner Balance owner
     */
    function balanceOf(address owner) external view returns (Balance memory) {
        return _balances[owner];
    }

    /**
     * Total count of shares created
     */
    function totalShares() external view returns (uint256) {
        return _shares;
    }

    /**
     * Sets fee and the decimals
     *
     * @param value Fee value
     * @param decimals Fee decimals
     */
    function setFee(uint256 value, uint8 decimals) external override onlyOwner {
        _feeValue = value;
        _feeDecimals = decimals;
        emit FeeUpdated(_token, _feeValue, _feeDecimals);
    }

    /**
     * Calculate and collect the fees from an amount
     *
     * @param amount Total transaction amount
     */
    function collect(uint256 amount) external override {
        uint256 collectable = _getCollectable(amount);
        require(ERC20(_token).transferFrom(msg.sender, address(this), collectable), "Could not collect fees");
        emit FeeCollected(_token, collectable);
    }

    /**
     * Withdraws collected fees to an address
     *
     * @param to To whom the fees should be transferred
     * @param amount Shares to burn
     */
    function withdraw(address to, uint256 amount) external override {
        require(_balances[to].shares >= amount, "Burn exceeds balance");

        uint256 feesCollected = ERC20(_token).balanceOf(address(this));
        uint256 shareValue = feesCollected.add(_totalLiability).div(_shares);

        uint256 amortizedLiability = amount.mul(_balances[to].liability).div(_balances[to].shares);
        uint256 withdrawAmount = amount.mul(shareValue).sub(amortizedLiability);

        _balances[to].shares = _balances[to].shares.sub(amount);
        _balances[to].liability = _balances[to].liability.sub(amortizedLiability);
        _shares = _shares.sub(amount);
        _totalLiability = _totalLiability.sub(amortizedLiability);

        require(ERC20(_token).transfer(to, withdrawAmount), "Could not withdraw fees");
        emit FeeWithdrawn(_token, to, withdrawAmount, amount);
    }

    /**
     * Creates new tokens that represent a share when withdrawing fees
     *
     * @param to To whom the tokens should be minted
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount) external override {
        uint256 feesCollected = ERC20(_token).balanceOf(address(this));
        // If no share was minted, share value should worth nothing
        uint256 shareValue = 0;

        // Otherwise it should divide the total collected by total shares minted
        if (_shares > 0) {
            shareValue = feesCollected.add(_totalLiability).div(_shares);
        }

        uint256 newLiability = amount.mul(shareValue);

        _balances[to].shares = _balances[to].shares.add(amount);
        _balances[to].liability = _balances[to].liability.add(newLiability);
        _shares = _shares.add(amount);
        _totalLiability = _totalLiability.add(newLiability);

        emit ShareMinted(_token, to, amount);
    }

    /**
     * Internal function to calculate the collectable from a given amount
     *
     * @param amount Total transaction amount
     */
    function _getCollectable(uint256 amount) internal view returns (uint256) {
        return amount.sub(amount.mul(_feeValue).div(10**uint256(_feeDecimals)));
    }
}
