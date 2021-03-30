// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
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
    using SafeERC20 for IERC20;

    /**
     * @dev Minimum allowed exercise window: 24 hours
     */
    uint256 public constant MIN_EXERCISE_WINDOW_SIZE = 86400;

    OptionType private immutable _optionType;
    ExerciseType private immutable _exerciseType;
    IConfigurationManager private immutable _configurationManager;

    address private immutable _underlyingAsset;
    address private immutable _strikeAsset;
    uint256 private immutable _strikePrice;
    uint256 private immutable _expiration;
    uint256 private _startOfExerciseWindow;

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
        require(expiration > block.timestamp, "PodOption: expiration should be in the future");
        require(strikePrice > 0, "PodOption: strike price must be greater than zero");

        if (exerciseType == ExerciseType.EUROPEAN) {
            require(
                exerciseWindowSize >= MIN_EXERCISE_WINDOW_SIZE,
                "PodOption: exercise window must be greater than or equal 86400"
            );
            _startOfExerciseWindow = expiration.sub(exerciseWindowSize);
        } else {
            require(exerciseWindowSize == 0, "PodOption: exercise window size must be equal to zero");
            _startOfExerciseWindow = block.timestamp;
        }

        _configurationManager = configurationManager;

        _optionType = optionType;
        _exerciseType = exerciseType;
        _expiration = expiration;

        _underlyingAsset = underlyingAsset;
        _strikeAsset = strikeAsset;

        uint8 underlyingDecimals = tryDecimals(IERC20(underlyingAsset));
        tryDecimals(IERC20(strikeAsset));

        _strikePrice = strikePrice;
        _setupDecimals(underlyingDecimals);
    }

    /**
     * @notice Checks if the options series has already expired.
     */
    function hasExpired() external override view returns (bool) {
        return _hasExpired();
    }

    /**
     * @notice External function to calculate the amount of strike asset
     * needed given the option amount
     */
    function strikeToTransfer(uint256 amountOfOptions) external override view returns (uint256) {
        return _strikeToTransfer(amountOfOptions);
    }

    /**
     * @notice Checks if the options trade window has opened.
     */
    function isTradeWindow() external override view returns (bool) {
        return _isTradeWindow();
    }

    /**
     * @notice Checks if the options exercise window has opened.
     */
    function isExerciseWindow() external override view returns (bool) {
        return _isExerciseWindow();
    }

    /**
     * @notice Checks if the options withdraw window has opened.
     */
    function isWithdrawWindow() external override view returns (bool) {
        return _isWithdrawWindow();
    }

    /**
     * @notice The option type. eg: CALL, PUT
     */
    function optionType() external override view returns (OptionType) {
        return _optionType;
    }

    /**
     * @notice Exercise type. eg: AMERICAN, EUROPEAN
     */
    function exerciseType() external override view returns (ExerciseType) {
        return _exerciseType;
    }

    /**
     * @notice The sell price of each unit of underlyingAsset; given in units
     * of strikeAsset, e.g. 0.99 USDC
     */
    function strikePrice() external override view returns (uint256) {
        return _strikePrice;
    }

    /**
     * @notice The number of decimals of strikePrice
     */
    function strikePriceDecimals() external override view returns (uint8) {
        return ERC20(_strikeAsset).decimals();
    }

    /**
     * @notice The timestamp in seconds that represents the series expiration
     */
    function expiration() external override view returns (uint256) {
        return _expiration;
    }

    /**
     * @notice How many decimals does the strike token have? E.g.: 18
     */
    function strikeAssetDecimals() external override view returns (uint8) {
        return ERC20(_strikeAsset).decimals();
    }

    /**
     * @notice The asset used as the strike asset, e.g. USDC, DAI
     */
    function strikeAsset() public override view returns (address) {
        return _strikeAsset;
    }

    /**
     * @notice How many decimals does the underlying token have? E.g.: 18
     */
    function underlyingAssetDecimals() public override view returns (uint8) {
        return ERC20(_underlyingAsset).decimals();
    }

    /**
     * @notice The asset used as the underlying token, e.g. WETH, WBTC, UNI
     */
    function underlyingAsset() public override view returns (address) {
        return _underlyingAsset;
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
        public
        override
        view
        returns (uint256 strikeAmount, uint256 underlyingAmount)
    {
        uint256 ownerShares = shares[owner];

        strikeAmount = ownerShares.mul(strikeReserves()).div(totalShares);
        underlyingAmount = ownerShares.mul(underlyingReserves()).div(totalShares);

        return (strikeAmount, underlyingAmount);
    }

    /**
     * @notice The timestamp in seconds that represents the start of exercise window
     */
    function startOfExerciseWindow() public override view returns (uint256) {
        return _startOfExerciseWindow;
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
     * @dev Modifier with the conditions to be able to mint/unmint
     * based on option exerciseType.
     */
    modifier tradeWindow() {
        require(_isTradeWindow(), "PodOption: trade window has closed");
        _;
    }

    /**
     * @dev Modifier with the conditions to be able to exercise
     * based on option exerciseType.
     */
    modifier exerciseWindow() {
        require(_isExerciseWindow(), "PodOption: not in exercise window");
        _;
    }

    /**
     * @dev Modifier with the conditions to be able to withdraw
     * based on exerciseType.
     */
    modifier withdrawWindow() {
        require(_isWithdrawWindow(), "PodOption: option has not expired yet");
        _;
    }

    /**
     * @dev Internal function to check expiration
     */
    function _hasExpired() internal view returns (bool) {
        return block.timestamp >= _expiration;
    }

    /**
     * @dev Internal function to check trade window
     */
    function _isTradeWindow() internal view returns (bool) {
        if (_hasExpired()) {
            return false;
        } else if (_exerciseType == ExerciseType.EUROPEAN) {
            return !_isExerciseWindow();
        }
        return true;
    }

    /**
     * @dev Internal function to check window exercise started
     */
    function _isExerciseWindow() internal view returns (bool) {
        return !_hasExpired() && block.timestamp >= _startOfExerciseWindow;
    }

    /**
     * @dev Internal function to check withdraw started
     */
    function _isWithdrawWindow() internal view returns (bool) {
        return _hasExpired();
    }

    /**
     * @dev Internal function to calculate the amount of strike asset needed given the option amount
     * @param amountOfOptions Intended amount to options to mint
     */
    function _strikeToTransfer(uint256 amountOfOptions) internal view returns (uint256) {
        uint256 strikeAmount = amountOfOptions.mul(_strikePrice).div(10**uint256(underlyingAssetDecimals()));
        require(strikeAmount > 0, "PodOption: amount of options is too low");
        return strikeAmount;
    }

    /**
     * @dev Calculate number of reserve shares based on the amount of collateral locked by the minter
     */
    function _calculatedShares(uint256 amountOfCollateral) internal view returns (uint256 ownerShares) {
        uint256 currentStrikeReserves = strikeReserves();
        uint256 currentUnderlyingReserves = underlyingReserves();

        uint256 numerator = amountOfCollateral.mul(totalShares);
        uint256 denominator;

        if (_optionType == OptionType.PUT) {
            denominator = currentStrikeReserves.add(
                currentUnderlyingReserves.mul(_strikePrice).div(uint256(10)**underlyingAssetDecimals())
            );
        } else {
            denominator = currentUnderlyingReserves.add(
                currentStrikeReserves.mul(uint256(10)**underlyingAssetDecimals()).div(_strikePrice)
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
        require(owner != address(0), "PodOption: zero address cannot be the owner");

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

    /**
     * @dev Burns options, removing shares accordingly and releasing a certain amount of collateral.
     * In case of American options where exercise can happen before the expiration, the caller may receive a
     * mix of underlying asset and strike asset.
     * @param amountOfOptions The amount option tokens to be burned
     * @param owner Which address options will be burned from
     */
    function _burnOptions(uint256 amountOfOptions, address owner)
        internal
        returns (
            uint256 strikeToSend,
            uint256 underlyingToSend,
            uint256 currentStrikeReserves,
            uint256 currentUnderlyingReserves
        )
    {
        uint256 ownerShares = shares[owner];
        require(ownerShares > 0, "PodOption: you do not have minted options");

        uint256 ownerMintedOptions = mintedOptions[owner];
        require(amountOfOptions <= ownerMintedOptions, "PodOption: not enough minted options");

        currentStrikeReserves = strikeReserves();
        currentUnderlyingReserves = underlyingReserves();

        uint256 burnedShares = ownerShares.mul(amountOfOptions).div(ownerMintedOptions);
        strikeToSend = burnedShares.mul(currentStrikeReserves).div(totalShares);
        underlyingToSend = burnedShares.mul(currentUnderlyingReserves).div(totalShares);

        shares[owner] = shares[owner].sub(burnedShares);
        mintedOptions[owner] = mintedOptions[owner].sub(amountOfOptions);
        totalShares = totalShares.sub(burnedShares);

        _burn(owner, amountOfOptions);
    }

    /**
     * @dev Removes all shares, returning the amounts that would be withdrawable
     */
    function _withdraw() internal returns (uint256 strikeToSend, uint256 underlyingToSend) {
        uint256 ownerShares = shares[msg.sender];
        require(ownerShares > 0, "PodOption: you do not have balance to withdraw");

        (strikeToSend, underlyingToSend) = getSellerWithdrawAmounts(msg.sender);

        shares[msg.sender] = 0;
        mintedOptions[msg.sender] = 0;
        totalShares = totalShares.sub(ownerShares);
    }
}
