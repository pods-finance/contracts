// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../interfaces/IFeePool.sol";

/**
 * @title FeePool
 * @author Pods Finance
 * @notice Represents a pool that manages fee collection.
 * Shares can be created to redeem the collected fees between participants proportionally.
 */
contract FeePool is IFeePool, Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    mapping(address => Balance) private _balances;
    uint256 private _shares;
    uint256 private _totalLiability;

    uint256 private _feeValue;
    uint8 private _feeDecimals;
    address private immutable _token;

    event FeeUpdated(address token, uint256 newFee, uint8 newFeeDecimals);
    event FeeWithdrawn(address token, address to, uint256 amountWithdrawn, uint256 sharesBurned);
    event ShareMinted(address token, address to, uint256 amountMinted);

    constructor(
        address token,
        uint256 feeValue,
        uint8 feeDecimals
    ) public {
        require(token != address(0), "FeePool: Invalid token");
        require(feeDecimals <= 77 && feeValue <= uint256(10)**feeDecimals, "FeePool: Invalid Fee data");
        _token = token;
        _feeValue = feeValue;
        _feeDecimals = feeDecimals;
    }

    /**
     * @notice Sets fee and the decimals
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
     * @notice Withdraws collected fees to an address
     *
     * @param to To whom the fees should be transferred
     * @param amountOfShares Amount of Shares to burn
     */
    function withdraw(address to, uint256 amountOfShares) external override onlyOwner {
        require(_balances[to].shares >= amountOfShares, "Burn exceeds balance");

        uint256 feesCollected = IERC20(_token).balanceOf(address(this));

        uint256 amortizedLiability = amountOfShares.mul(_balances[to].liability).div(_balances[to].shares);
        uint256 withdrawAmount = feesCollected.add(_totalLiability).mul(amountOfShares).div(_shares).sub(
            amortizedLiability
        );

        _balances[to].shares = _balances[to].shares.sub(amountOfShares);
        _balances[to].liability = _balances[to].liability.sub(amortizedLiability);
        _shares = _shares.sub(amountOfShares);
        _totalLiability = _totalLiability.sub(amortizedLiability);

        if (withdrawAmount > 0) {
            IERC20(_token).safeTransfer(to, withdrawAmount);
            emit FeeWithdrawn(_token, to, withdrawAmount, amountOfShares);
        }
    }

    /**
     * @notice Creates new shares that represent a fraction when withdrawing fees
     *
     * @param to To whom the tokens should be minted
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount) external override onlyOwner {
        // If no share was minted, share value should worth nothing
        uint256 newLiability = 0;

        // Otherwise it should divide the total collected by total shares minted
        if (_shares > 0) {
            uint256 feesCollected = IERC20(_token).balanceOf(address(this));
            newLiability = feesCollected.add(_totalLiability).mul(amount).div(_shares);
        }

        _balances[to].shares = _balances[to].shares.add(amount);
        _balances[to].liability = _balances[to].liability.add(newLiability);
        _shares = _shares.add(amount);
        _totalLiability = _totalLiability.add(newLiability);

        emit ShareMinted(_token, to, amount);
    }

    /**
     * @notice Return the current fee value
     */
    function feeValue() external override view returns (uint256) {
        return _feeValue;
    }

    /**
     * @notice Returns the number of decimals used to represent fees
     */
    function feeDecimals() external override view returns (uint8) {
        return _feeDecimals;
    }

    /**
     * @notice Utility function to calculate fee charges to a given amount
     *
     * @param amount Total transaction amount
     */
    function getCollectable(uint256 amount) external override view returns (uint256) {
        return amount.mul(_feeValue).div(10**uint256(_feeDecimals));
    }

    /**
     * @notice Return balance of an address
     *
     * @param owner Balance owner
     */
    function balanceOf(address owner) external view returns (Balance memory) {
        return _balances[owner];
    }

    /**
     * @notice Return shares of an address
     *
     * @param owner Balance owner
     */
    function sharesOf(address owner) external override view returns (uint256) {
        return _balances[owner].shares;
    }

    /**
     * @notice Total count of shares created
     */
    function totalShares() external view returns (uint256) {
        return _shares;
    }
}
