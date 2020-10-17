// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

interface IFeePool {
    function getFee() external view returns (uint256);

    function setFee(uint256 fee, uint8 decimals) external;

    function getFeeDecimals() external view returns (uint8);

    function getCollectable(uint256 amount) external view returns (uint256);

    function collect(uint256 amount) external;

    function withdraw(uint256 amount, address to) external;
}

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

    function getFee() external override view returns (uint256) {
        return _fee;
    }

    function setFee(uint256 fee, uint8 decimals) external override onlyOwner {
        _fee = fee;
        _feeDecimals = decimals;
        emit FeeUpdated(_token, _fee, _feeDecimals);
    }

    function getFeeDecimals() external override view returns (uint8) {
        return _feeDecimals;
    }

    function getCollectable(uint256 amount) external override view returns (uint256) {
        return _getCollectable(amount);
    }

    function collect(uint256 amount) external override {
        uint256 collectable = _getCollectable(amount);

        require(ERC20(_token).transferFrom(msg.sender, address(this), collectable), "Could not collect fees");
        emit FeeCollected(_token, collectable);
    }

    function withdraw(uint256 amount, address to) external override onlyOwner {
        require(ERC20(_token).transfer(to, amount), "Could not withdraw fees");
        emit FeeWithdrawn(_token, amount, to);
    }

    function _getCollectable(uint256 amount) internal view returns (uint256) {
        return amount.mul(_fee).div(10**uint256(_feeDecimals));
    }
}
