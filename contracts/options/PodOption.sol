// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "../lib/RequiredDecimals.sol";

/**
 * @title PodOption
 * @author Pods Finance
 *
 * @notice This contract represents the basic structure of the financial instrument
 * known as Option, sharing logic between both a PUT or a CALL types.
 *
 * @dev There are four main actions that can be called in an Option:
 *
 * A) mint => A minter can lock collateral and create new options before expiration.
 * B) unmint => The minter who previously minted can choose for leaving its position any given time
 * until expiration.
 * C) exercise => The option bearer the can exchange its option for the collateral at the strike price.
 * D) withdraw => The minter can retrieve collateral at the end of the series.
 *
 * Depending on the type (PUT / CALL) or the exercise (AMERICAN / EUROPEAN), those functions have
 * different behave and should be override accordingly.
 */
abstract contract PodOption is ERC20, RequiredDecimals {
    using SafeMath for uint8;

    /**
     * @dev Minimum allowed exercise window: 24 hours
     */
    uint256 public constant MIN_EXERCISE_WINDOW_SIZE = 86400;

    enum OptionType { PUT, CALL }
    enum ExerciseType { EUROPEAN, AMERICAN }

    /**
     * @dev The option type. eg: CALL, PUT
     */
    OptionType public optionType;

    /**
     * @dev Exercise type
     */
    ExerciseType public exerciseType;

    /**
     * @notice The asset used as the underlying token, e.g. WETH, WBTC, UNI
     */
    address public underlyingAsset;

    /**
     * @notice How many decimals does the underlying token have? E.g.: 18
     */
    uint8 public underlyingAssetDecimals;

    /**
     * @notice The asset used as the strike asset, e.g. USDC, DAI
     */
    address public strikeAsset;

    /**
     * @notice How many decimals does the strike token have? E.g.: 18
     */
    uint8 public strikeAssetDecimals;

    /**
     * @notice The sell price of each unit of underlyingAsset; given in units
     * of strikeAsset, e.g. 0.99 USDC
     */
    uint256 public strikePrice;

    /**
     * @notice The number of decimals of strikePrice
     */
    uint8 public strikePriceDecimals;

    /**
     * @notice The UNIX timestamp that represents the series expiration
     */
    uint256 public expiration;

    /**
     * @notice The UNIX timestamp that represents the end of exercise window
     */
    uint256 public endOfExerciseWindow;

    /**
     * @notice Reserve share balance
     * @dev Tracks the shares of the total asset reserve by address
     */
    mapping(address => uint256) public shares;

    /**
     * @notice Minted option balance
     * @dev Tracks amount of minted options by address
     */
    mapping(address => uint256) public mintedOptions;

    /**
     * @notice Total reserve shares
     */
    uint256 public totalShares = 0;

    /** Events */
    event Mint(address indexed minter, uint256 amount);
    event Unmint(address indexed minter, uint256 amount);
    event Exercise(address indexed exerciser, uint256 amount);
    event Withdraw(address indexed minter, uint256 amount);

    constructor(
        string memory name,
        string memory symbol,
        OptionType _optionType,
        ExerciseType _exerciseType,
        address _underlyingAsset,
        address _strikeAsset,
        uint256 _strikePrice,
        uint256 _expiration,
        uint256 _exerciseWindowSize
    ) public ERC20(name, symbol) {
        require(Address.isContract(_underlyingAsset), "PodOption: underlying asset is not a contract");
        require(Address.isContract(_strikeAsset), "PodOption: strike asset is not a contract");
        require(_underlyingAsset != _strikeAsset, "PodOption: underlying asset and strike asset must differ");
        require(_expiration > block.timestamp, "PodOption: expiration should be in a future timestamp");
        require(_exerciseWindowSize > 0, "PodOption: exercise window size must be greater than zero");
        require(_strikePrice > 0, "PodOption: strike price must be greater than zero");

        if (_exerciseType == ExerciseType.EUROPEAN) {
            require(
                _exerciseWindowSize >= MIN_EXERCISE_WINDOW_SIZE,
                "PodOption: exercise window must be greater than or equal 86400"
            );
        }

        optionType = _optionType;
        exerciseType = _exerciseType;
        expiration = _expiration;
        endOfExerciseWindow = _expiration.add(_exerciseWindowSize);

        underlyingAsset = _underlyingAsset;
        underlyingAssetDecimals = tryDecimals(IERC20(_underlyingAsset));
        _setupDecimals(underlyingAssetDecimals);

        strikeAsset = _strikeAsset;
        strikeAssetDecimals = tryDecimals(IERC20(_strikeAsset));

        strikePrice = _strikePrice;
        strikePriceDecimals = strikeAssetDecimals;
    }

    /**
     * @notice Locks collateral and write option tokens.
     *
     * @dev The issued amount ratio is 1:1, i.e., 1 option token for 1 underlying token.
     *
     * The collateral could be underlying or strike asset depending on the option type: Put or Call,
     * respectively
     *
     * It presumes the caller has already called IERC20.approve() on the
     * strike token contract to move caller funds.
     *
     * Options can only be minted while the series is NOT expired.
     *
     * It is also important to notice that options will be sent back
     * to `msg.sender` and not the `owner`. This behavior is designed to allow
     * proxy contracts to mint on others behalf
     *
     * @param amountOfOptions The amount option tokens to be issued
     * @param owner Which address will be the owner of the options
     */
    function mint(uint256 amountOfOptions, address owner) external virtual;

    /**
     * @notice Allow option token holders to use them to exercise the amount of units
     * of the locked tokens for the equivalent amount of the exercisable assets.
     *
     * @dev It presumes the caller has already called IERC20.approve() exercisable asset
     * to move caller funds.
     *
     * On American options, this function can only called anytime before expiration.
     * For European options, this function can only be called during the exerciseWindow.
     * Meaning, after expiration and before the end of exercise window.
     *
     * @param amountOfOptions The amount option tokens to be exercised
     */
    function exercise(uint256 amountOfOptions) external virtual;

    /**
     * @notice After series expiration, allow minters who have locked their
     * collateral to withdraw them proportionally to their minted options.
     *
     * @dev If assets had been exercised during the option series the minter may withdraw
     * the exercised assets or a combination of exercised and collateral.
     */
    function withdraw() external virtual;

    /**
     * @notice Unlocks collateral by burning option tokens.
     *
     * @dev In case of American options where exercise can happen before the expiration, caller
     * may receive a mix of underlying asset and strike asset.
     *
     * Options can only be burned while the series is NOT expired.
     *
     * @param amountOfOptions The amount option tokens to be burned
     */
    function unmint(uint256 amountOfOptions) external virtual;

    /**
     * @notice Utility function to check the amount of the underlying tokens
     * locked inside this contract
     */
    function underlyingBalance() external view returns (uint256) {
        return IERC20(underlyingAsset).balanceOf(address(this));
    }

    /**
     * @notice Utility function to check the amount of the strike tokens locked
     * inside this contract
     */
    function strikeBalance() external view returns (uint256) {
        return IERC20(strikeAsset).balanceOf(address(this));
    }

    /**
     * @notice Checks if the options series has already expired.
     */
    function hasExpired() external view returns (bool) {
        return _hasExpired();
    }

    /**
     * @notice Checks if the options exercise window has closed.
     */
    function isAfterEndOfExerciseWindow() external view returns (bool) {
        return _isAfterEndOfExerciseWindow();
    }

    /**
     * @notice External function to calculate the amount of strike asset
     * needed given the option amount
     */
    function strikeToTransfer(uint256 amountOfOptions) external view returns (uint256) {
        return _strikeToTransfer(amountOfOptions);
    }

    /**
     * @dev Modifier for functions which are only allowed to be executed
     * BEFORE series expiration.
     */
    modifier beforeExpiration() {
        require(!_hasExpired(), "PodOption: Option has expired");
        _;
    }

    /**
     * @dev Modifier with the conditions to be able to exercise
     * based on option exerciseType.
     */
    modifier exerciseWindow() {
        if (exerciseType == ExerciseType.EUROPEAN) {
            require(_hasExpired(), "PodOption: Option has not expired yet");
            require(!_isAfterEndOfExerciseWindow(), "PodOption: Window of exercise has closed already");
        } else {
            require(!_hasExpired(), "PodOption: Option has expired");
        }
        _;
    }

    /**
     * @dev Modifier with the conditions to be able to withdraw
     * based on exerciseType.
     */
    modifier withdrawWindow() {
        if (exerciseType == ExerciseType.EUROPEAN) {
            require(_isAfterEndOfExerciseWindow(), "PodOption: Window of exercise has not ended yet");
        } else {
            require(_hasExpired(), "PodOption: Option has not expired yet");
        }
        _;
    }

    /**
     * @dev Internal function to check expiration
     */
    function _hasExpired() internal view returns (bool) {
        return block.timestamp >= expiration;
    }

    /**
     * @dev Internal function to check window exercise ended
     */
    function _isAfterEndOfExerciseWindow() internal view returns (bool) {
        return block.timestamp >= endOfExerciseWindow;
    }

    /**
     * @dev Internal function to calculate the amount of strike asset needed given the option amount
     * @param amountOfOptions Intended amount to options to mint
     */
    function _strikeToTransfer(uint256 amountOfOptions) internal view returns (uint256) {
        uint256 strikeAmount = amountOfOptions.mul(strikePrice).div(
            10**underlyingAssetDecimals.add(strikePriceDecimals).sub(strikeAssetDecimals)
        );
        require(strikeAmount > 0, "PodOption: Invalid amount of collateral");
        return strikeAmount + 1;
    }

    /**
     * @dev Calculate number of reserve shares based on the amount of collateral locked by the minter
     */
    function _calculatedShares(uint256 amountOfCollateral) internal view returns (uint256 ownerShares) {
        uint256 strikeReserves = IERC20(strikeAsset).balanceOf(address(this));
        uint256 underlyingReserves = IERC20(underlyingAsset).balanceOf(address(this));

        uint256 numerator = amountOfCollateral.mul(totalShares);
        uint256 denominator;

        if (optionType == OptionType.PUT) {
            denominator = strikeReserves.add(
                underlyingReserves.mul(strikePrice).div((uint256(10)**underlyingAssetDecimals))
            );
        } else {
            denominator = underlyingReserves.add(
                strikeReserves.mul((uint256(10)**underlyingAssetDecimals).div(strikePrice))
            );
        }
        ownerShares = numerator.div(denominator);
        return ownerShares;
    }
}
