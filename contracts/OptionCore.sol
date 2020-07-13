// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract OptionCore is ERC20 {
    enum OptionType { PUT, CALL }

    OptionType public optionType;

    /**
     * The asset used as the underlying token, e.g. DAI
     */
    address public underlyingAsset;

    /**
     * How many decimals does the underlying token have? E.g.: 18
     */
    uint8 public underlyingAssetDecimals;

    /**
     * The strike asset for this vault, e.g. USDC
     */
    address public strikeAsset;

    /**
     * How many decimals does the strike token have? E.g.: 18
     */
    uint8 public strikeAssetDecimals;

    /**
     * The sell price of each unit of strikeAsset; given in units
     * of strikeAsset, e.g. 0.99 USDC
     */
    uint256 public strikePrice;

    /**
     * The number of decimals of strikePrice
     */
    uint8 public strikePriceDecimals;

    /**
     * This option series is considered expired starting from this block
     * number
     */
    uint256 public expirationBlockNumber;

    /**
     * Uniswap Factory address used to sell options
     */
    address public uniswapFactoryAddress;

    /**
     * Tracks how much of the strike token each address has locked
     * inside this contract
     */
    mapping(address => uint256) public lockedBalance;

    constructor(
        string memory name,
        string memory symbol,
        OptionType _optionType,
        address _underlyingAsset,
        address _strikeAsset,
        uint256 _strikePrice,
        uint256 _expirationBlockNumber,
        address _uniswapFactory
    ) public ERC20(name, symbol) {
        optionType = _optionType;
        underlyingAssetDecimals = 18;
        strikeAssetDecimals = 18;

        strikeAsset = _strikeAsset;
        underlyingAsset = _underlyingAsset;
        strikePrice = _strikePrice;
        expirationBlockNumber = _expirationBlockNumber;
        uniswapFactoryAddress = _uniswapFactory;

        if (!_isETH(_underlyingAsset)) {
            underlyingAssetDecimals = ERC20(_underlyingAsset).decimals();
        }

        if (!_isETH(_strikeAsset)) {
            strikeAssetDecimals = ERC20(_strikeAsset).decimals();
        }

        strikePriceDecimals = strikeAssetDecimals;
        _setupDecimals(underlyingAssetDecimals);
    }

    /**
     * Utility function to check the amount of the underlying tokens
     * locked inside this contract
     */
    function underlyingBalance() external view returns (uint256) {
        return _contractBalanceOf(underlyingAsset);
    }

    /**
     * Utility function to check the amount of the strike tokens locked
     * inside this contract
     */
    function strikeBalance() external view returns (uint256) {
        return _contractBalanceOf(strikeAsset);
    }

    /**
     * Checks if the options series has already expired.
     */
    function hasExpired() external view returns (bool) {
        return _hasExpired();
    }

    /**
     * Maker modifier for functions which are only allowed to be executed
     * BEFORE series expiration.
     */
    modifier beforeExpiration() {
        if (_hasExpired()) {
            revert("Option has expired");
        }
        _;
    }

    /**
     * Maker modifier for functions which are only allowed to be executed
     * AFTER series expiration.
     */
    modifier afterExpiration() {
        if (!_hasExpired()) {
            revert("Option has not expired yet");
        }
        _;
    }

    /**
     * Internal function to check expiration
     */
    function _hasExpired() internal view returns (bool) {
        return block.number >= expirationBlockNumber;
    }

    /**
     * Check if an asset is ETH which is represented by
     * the address 0x0000000000000000000000000000000000000000
     */
    function _isETH(address asset) internal pure returns (bool) {
        return asset == address(0);
    }

    function _contractBalanceOf(address asset) internal view returns (uint256) {
        if (_isETH(asset)) {
            return address(this).balance;
        }

        return ERC20(asset).balanceOf(address(this));
    }
}
