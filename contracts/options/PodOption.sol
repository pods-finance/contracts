// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";

abstract contract PodOption is ERC20 {
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
     * The UNIX timestamp that represents the series expiration
     */
    uint256 public expiration;

    /**
     * The UNIX timestamp that represents the end of exercise window
     */
    uint256 public endOfExerciseWindow;

    /**
     * Tracks how much of the strike token each address has locked
     * inside this contract
     */
    mapping(address => uint256) public lockedBalance;

    /** Events */
    event Mint(address indexed seller, uint256 amount);
    event Unwind(address indexed seller, uint256 amount);
    event Exercise(address indexed buyer, uint256 amount);
    event Withdraw(address indexed seller, uint256 amount);

    constructor(
        string memory name,
        string memory symbol,
        OptionType _optionType,
        address _underlyingAsset,
        address _strikeAsset,
        uint256 _strikePrice,
        uint256 _expiration,
        uint256 _exerciseWindowSize
    ) public ERC20(name, symbol) {
        require(Address.isContract(_underlyingAsset), "PodOption/underlying-asset-is-not-a-contract");
        require(Address.isContract(_strikeAsset), "PodOption/strike-asset-is-not-a-contract");
        require(_underlyingAsset != _strikeAsset, "PodOption/underlying-asset-and-strike-asset-must-differ");
        require(_expiration > block.timestamp, "PodOption/expiration-should-be-in-a-future-timestamp");
        require(_exerciseWindowSize > 0, "PodOption/exercise-window-size-must-be-greater-than-zero");
        require(_strikePrice > 0, "PodOption/strike-price-must-be-greater-than-zero");

        optionType = _optionType;
        expiration = _expiration;
        endOfExerciseWindow = _expiration + _exerciseWindowSize;

        underlyingAsset = _underlyingAsset;
        underlyingAssetDecimals = ERC20(_underlyingAsset).decimals();
        _setupDecimals(underlyingAssetDecimals);

        strikeAsset = _strikeAsset;
        strikeAssetDecimals = ERC20(_strikeAsset).decimals();

        strikePrice = _strikePrice;
        strikePriceDecimals = strikeAssetDecimals;
    }

    /**
     * Locks some amount of collateral and writes option tokens.
     *
     * The issued amount ratio is 1:1, i.e., 1 option token for 1 underlying token.
     *
     * It presumes the caller has already called IERC20.approve() on the
     * strike token contract to move caller funds.
     *
     * This function is meant to be called by collateral holders wanting
     * to write option tokens.
     *
     * Options can only be minted while the series is NOT expired.
     *
     * @param amount The amount option tokens to be issued
     * @param owner Which address will be the owner of the options
     */
    function mint(uint256 amount, address owner) external virtual;

    /**
     * Allow option token holders to use them to exercise the amount of units
     * of the locked tokens for the equivalent amount of the exercisable assets.
     *
     * It presumes the caller has already called IERC20.approve() exercisable asset
     * to move caller funds.
     *
     * Options can only be exchanged while the series is NOT expired.
     * @param amount The amount option tokens to be exercised
     */
    function exercise(uint256 amount) external virtual;

    /**
     * After series expiration, allow addresses who have locked their
     * collateral to withdraw them on first-come-first-serve basis.
     *
     * If assets had been exercised during the option series the caller may withdraw
     * the exercised assets or a combination of exercised and collateral.
     */
    function withdraw() external virtual;

    /**
     * Unlocks the amount of collateral by burning option tokens.
     *
     * This mechanism ensures that users can only redeem tokens they've
     * previously lock into this contract.
     *
     * Options can only be burned while the series is NOT expired.
     * @param amount The amount option tokens to be burned
     */
    function unwind(uint256 amount) external virtual;

    /**
     * Utility function to check the amount of the underlying tokens
     * locked inside this contract
     */
    function underlyingBalance() external view returns (uint256) {
        return ERC20(underlyingAsset).balanceOf(address(this));
    }

    /**
     * Utility function to check the amount of the strike tokens locked
     * inside this contract
     */
    function strikeBalance() external view returns (uint256) {
        return ERC20(strikeAsset).balanceOf(address(this));
    }

    /**
     * Checks if the options series has already expired.
     */
    function hasExpired() external view returns (bool) {
        return _hasExpired();
    }

    /**
     * Checks if the options exercise window has closed.
     */
    function isAfterExerciseWindow() external view returns (bool) {
        return _isAfterExerciseWindow();
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
     * Maker modifier for functions which are only allowed to be executed
     * BEFORE window of exercise
     */
    modifier beforeExerciseWindow() {
        if (_isAfterExerciseWindow()) {
            revert("Window of exercise has closed already");
        }
        _;
    }

    /**
     * Maker modifier for functions which are only allowed to be executed
     * AFTER series expiration.
     */
    modifier afterExerciseWindow() {
        if (!_isAfterExerciseWindow()) {
            revert("Window of exercise not close yet");
        }
        _;
    }

    /**
     * Internal function to check expiration
     */
    function _hasExpired() internal view returns (bool) {
        return block.timestamp >= expiration;
    }

    /**
     * Internal function to check window exercise ended
     */
    function _isAfterExerciseWindow() internal view returns (bool) {
        return block.timestamp >= endOfExerciseWindow;
    }
}
