// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "../interfaces/IPodOption.sol";
import "../lib/CappedOption.sol";
import "../lib/RequiredDecimals.sol";
import "../interfaces/IConfigurationManager.sol";

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
abstract contract PodOption is IPodOption, ERC20, RequiredDecimals, CappedOption {
    using SafeMath for uint8;

    /**
     * @dev Minimum allowed exercise window: 24 hours
     */
    uint256 public constant MIN_EXERCISE_WINDOW_SIZE = 86400;

    OptionType private _optionType;
    ExerciseType private _exerciseType;
    IConfigurationManager private _configurationManager;

    address private _underlyingAsset;
    uint8 private _underlyingAssetDecimals;

    address private _strikeAsset;
    uint8 private _strikeAssetDecimals;

    uint256 private _strikePrice;
    uint8 private _strikePriceDecimals;

    uint256 private _expiration;
    uint256 private _endOfExerciseWindow;

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

    constructor(
        string memory name,
        string memory symbol,
        OptionType optionType,
        ExerciseType exerciseType,
        address underlyingAsset,
        address strikeAsset,
        uint256 strikePrice,
        uint256 expiration,
        uint256 exerciseWindowSize,
        IConfigurationManager configurationManager
    ) public ERC20(name, symbol) CappedOption(configurationManager) {
        require(Address.isContract(underlyingAsset), "PodOption: underlying asset is not a contract");
        require(Address.isContract(strikeAsset), "PodOption: strike asset is not a contract");
        require(underlyingAsset != strikeAsset, "PodOption: underlying asset and strike asset must differ");
        require(expiration > block.timestamp, "PodOption: expiration should be in a future timestamp");
        require(exerciseWindowSize > 0, "PodOption: exercise window size must be greater than zero");
        require(strikePrice > 0, "PodOption: strike price must be greater than zero");

        if (_exerciseType == ExerciseType.EUROPEAN) {
            require(
                exerciseWindowSize >= MIN_EXERCISE_WINDOW_SIZE,
                "PodOption: exercise window must be greater than or equal 86400"
            );
        }

        _configurationManager = configurationManager;

        _optionType = optionType;
        _exerciseType = exerciseType;
        _expiration = expiration;
        _endOfExerciseWindow = expiration.add(exerciseWindowSize);

        _underlyingAsset = underlyingAsset;
        _underlyingAssetDecimals = tryDecimals(IERC20(_underlyingAsset));
        _setupDecimals(_underlyingAssetDecimals);

        _strikeAsset = strikeAsset;
        _strikeAssetDecimals = tryDecimals(IERC20(_strikeAsset));

        _strikePrice = strikePrice;
        _strikePriceDecimals = _strikeAssetDecimals;
    }

    /**
     * @notice getSellerWithdrawAmounts returns the seller position based on his amount of shares
     * and the current option position
     *
     * @param owner address of the user to check the withdraw amounts
     *
     * @return strikeAmount current amount of strike the user will receive. It may change until maturity
     * @return underlyingAmount current amount of underlying the user will receive. It may change until maturity
     */
    function getSellerWithdrawAmounts(address owner)
        external
        override
        view
        returns (uint256 strikeAmount, uint256 underlyingAmount)
    {
        uint256 ownerShares = shares[owner];

        uint256 strikeReserves = IERC20(_strikeAsset).balanceOf(address(this));
        uint256 underlyingReserves = IERC20(_underlyingAsset).balanceOf(address(this));

        strikeAmount = ownerShares.mul(strikeReserves).div(totalShares);
        underlyingAmount = ownerShares.mul(underlyingReserves).div(totalShares);

        return (strikeAmount, underlyingAmount);
    }

    /**
     * @notice Checks if the options series has already expired.
     */
    function hasExpired() external override view returns (bool) {
        return _hasExpired();
    }

    /**
     * @notice Checks if the options exercise window has closed.
     */
    function isAfterEndOfExerciseWindow() external override view returns (bool) {
        return _isAfterEndOfExerciseWindow();
    }

    /**
     * @notice External function to calculate the amount of strike asset
     * needed given the option amount
     */
    function strikeToTransfer(uint256 amountOfOptions) external override view returns (uint256) {
        return _strikeToTransfer(amountOfOptions);
    }

    /**
     * @notice The option type. eg: CALL, PUT
     */
    function optionType() public override view returns (OptionType) {
        return _optionType;
    }

    /**
     * @notice Exercise type. eg: AMERICAN, EUROPEAN
     */
    function exerciseType() public override view returns (ExerciseType) {
        return _exerciseType;
    }

    /**
     * @notice The asset used as the underlying token, e.g. WETH, WBTC, UNI
     */
    function underlyingAsset() public override view returns (address) {
        return _underlyingAsset;
    }

    /**
     * @notice How many decimals does the underlying token have? E.g.: 18
     */
    function underlyingAssetDecimals() public override view returns (uint8) {
        return _underlyingAssetDecimals;
    }

    /**
     * @notice The asset used as the strike asset, e.g. USDC, DAI
     */
    function strikeAsset() public override view returns (address) {
        return _strikeAsset;
    }

    /**
     * @notice How many decimals does the strike token have? E.g.: 18
     */
    function strikeAssetDecimals() public override view returns (uint8) {
        return _strikeAssetDecimals;
    }

    /**
     * @notice The sell price of each unit of underlyingAsset; given in units
     * of strikeAsset, e.g. 0.99 USDC
     */
    function strikePrice() public override view returns (uint256) {
        return _strikePrice;
    }

    /**
     * @notice The number of decimals of strikePrice
     */
    function strikePriceDecimals() public override view returns (uint8) {
        return _strikePriceDecimals;
    }

    /**
     * @notice The UNIX timestamp that represents the series expiration
     */
    function expiration() public override view returns (uint256) {
        return _expiration;
    }

    /**
     * @notice The UNIX timestamp that represents the end of exercise window
     */
    function endOfExerciseWindow() public override view returns (uint256) {
        return _endOfExerciseWindow;
    }

    /**
     * @notice Utility function to check the amount of the underlying tokens
     * locked inside this contract
     */
    function underlyingReserves() public override view returns (uint256) {
        return IERC20(_underlyingAsset).balanceOf(address(this));
    }

    /**
     * @notice Utility function to check the amount of the strike tokens locked
     * inside this contract
     */
    function strikeReserves() public override view returns (uint256) {
        return IERC20(_strikeAsset).balanceOf(address(this));
    }

    /**
     * @dev Modifier for functions which are only allowed to be executed
     * BEFORE series expiration.
     */
    modifier beforeExpiration() {
        require(!_hasExpired(), "PodOption: option has expired");
        _;
    }

    /**
     * @dev Modifier with the conditions to be able to exercise
     * based on option exerciseType.
     */
    modifier exerciseWindow() {
        if (_exerciseType == ExerciseType.EUROPEAN) {
            require(_hasExpired(), "PodOption: option has not expired yet");
            require(!_isAfterEndOfExerciseWindow(), "PodOption: window of exercise has closed already");
        } else {
            require(!_hasExpired(), "PodOption: option has expired");
        }
        _;
    }

    /**
     * @dev Modifier with the conditions to be able to withdraw
     * based on exerciseType.
     */
    modifier withdrawWindow() {
        if (_exerciseType == ExerciseType.EUROPEAN) {
            require(_isAfterEndOfExerciseWindow(), "PodOption: window of exercise has not ended yet");
        } else {
            require(_hasExpired(), "PodOption: option has not expired yet");
        }
        _;
    }

    /**
     * @dev Internal function to check expiration
     */
    function _hasExpired() internal view returns (bool) {
        return block.timestamp >= _expiration;
    }

    /**
     * @dev Internal function to check window exercise ended
     */
    function _isAfterEndOfExerciseWindow() internal view returns (bool) {
        return block.timestamp >= _endOfExerciseWindow;
    }

    /**
     * @dev Internal function to calculate the amount of strike asset needed given the option amount
     * @param amountOfOptions Intended amount to options to mint
     */
    function _strikeToTransfer(uint256 amountOfOptions) internal view returns (uint256) {
        uint256 strikeAmount = amountOfOptions.mul(_strikePrice).div(10**uint256(_underlyingAssetDecimals));
        require(strikeAmount > 0, "PodOption: amount of options is too low");
        return strikeAmount;
    }

    /**
     * @dev Calculate number of reserve shares based on the amount of collateral locked by the minter
     */
    function _calculatedShares(uint256 amountOfCollateral) internal view returns (uint256 ownerShares) {
        uint256 _strikeReserves = strikeReserves();
        uint256 _underlyingReserves = underlyingReserves();

        uint256 numerator = amountOfCollateral.mul(totalShares);
        uint256 denominator;

        if (_optionType == OptionType.PUT) {
            denominator = _strikeReserves.add(
                _underlyingReserves.mul(_strikePrice).div((uint256(10)**_underlyingAssetDecimals))
            );
        } else {
            denominator = _underlyingReserves.add(
                _strikeReserves.mul((uint256(10)**_underlyingAssetDecimals).div(_strikePrice))
            );
        }
        ownerShares = numerator.div(denominator);
        return ownerShares;
    }

    /**
     * @dev Mint options, creating the shares accordingly to the amount of collateral provided
     * @param amountOfOptions The amount option tokens to be issued
     * @param amountOfCollateral The amount of collateral provided to mint options
     * @param owner Which address will be the owner of the options
     */
    function _mintOptions(
        uint256 amountOfOptions,
        uint256 amountOfCollateral,
        address owner
    ) internal capped(amountOfOptions) {
        if (totalShares > 0) {
            uint256 ownerShares = _calculatedShares(amountOfCollateral);

            shares[owner] = shares[owner].add(ownerShares);
            totalShares = totalShares.add(ownerShares);
        } else {
            shares[owner] = amountOfCollateral;
            totalShares = amountOfCollateral;
        }

        mintedOptions[owner] = mintedOptions[owner].add(amountOfOptions);

        _mint(msg.sender, amountOfOptions);
    }
}
