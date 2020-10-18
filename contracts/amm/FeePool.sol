// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../interfaces/IFeePool.sol";

contract FeePool is IFeePool, Ownable {
    using SafeMath for uint256;

    uint256 private _fee;
    uint8 private _feeDecimals;
    address private _token;

    event FeeUpdated(address token, uint256 newFee, uint8 newFeeDecimals);
    event FeeCollected(address token, uint256 amountCollected);
    event FeeWithdrawn(address token, uint256 amountWithdrawn, address to);

    constructor(
        address token,
        uint256 fee,
        uint8 decimals
    ) public {
        _token = token;
        _fee = fee;
        _feeDecimals = decimals;
    }

    /**
     * Return the current fee value
     */
    function getFee() external override view returns (uint256) {
        return _fee;
    }

    /**
     * Sets fee and the decimals
     *
     * @param fee Fee value
     * @param decimals Decimals
     */
    function setFee(uint256 fee, uint8 decimals) external override onlyOwner {
        _fee = fee;
        _feeDecimals = decimals;
        emit FeeUpdated(_token, _fee, _feeDecimals);
    }

    /**
     * Returns the number of decimals used to represent fees
     */
    function getFeeDecimals() external override view returns (uint8) {
        return _feeDecimals;
    }

    /**
     * Calculate fee charges to a given amount
     *
     * @param amount Amount to charge on top
     */
    function getCollectable(uint256 amount) external override view returns (uint256) {
        return _getCollectable(amount);
    }

    /**
     * Calculate and collect the fees from an amount
     *
     * @param amount Amount to charge on top
     */
    function collect(uint256 amount) external override {
        uint256 collectable = _getCollectable(amount);

        require(ERC20(_token).transferFrom(msg.sender, address(this), collectable), "Could not collect fees");
        emit FeeCollected(_token, collectable);
    }

    /**
     * Withdraws collected fees to an address
     *
     * @param amount Amount to withdraw
     * @param to To whom the fees should be transferred
     */
    function withdraw(uint256 amount, address to) external override onlyOwner {
        require(ERC20(_token).transfer(to, amount), "Could not withdraw fees");
        emit FeeWithdrawn(_token, amount, to);
    }

    /**
     * Internal function to estimate fees
     *
     * @param amount Amount to charge on top
     */
    function _getCollectable(uint256 amount) internal view returns (uint256) {
        return amount.mul(_fee).div(10**uint256(_feeDecimals));
    }
}
