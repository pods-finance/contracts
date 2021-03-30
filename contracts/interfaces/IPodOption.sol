// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPodOption is IERC20 {
    /** Enums */
    // @dev 0 for Put, 1 for Call
    enum OptionType { PUT, CALL }
    // @dev 0 for European, 1 for American
    enum ExerciseType { EUROPEAN, AMERICAN }

    /** Events */
    event Mint(address indexed minter, uint256 amount);
    event Unmint(address indexed minter, uint256 optionAmount, uint256 strikeAmount, uint256 underlyingAmount);
    event Exercise(address indexed exerciser, uint256 amount);
    event Withdraw(address indexed minter, uint256 strikeAmount, uint256 underlyingAmount);

    /** Functions */

    /**
     * @notice Locks collateral and write option tokens.
     *
     * @dev The issued amount ratio is 1:1, i.e., 1 option token for 1 underlying token.
     *
     * The collateral could be the strike or the underlying asset depending on the option type: Put or Call,
     * respectively
     *
     * It presumes the caller has already called IERC20.approve() on the
     * strike/underlying token contract to move caller funds.
     *
     * Options can only be minted while the series is NOT expired.
     *
     * It is also important to notice that options will be sent back
     * to `msg.sender` and not the `owner`. This behavior is designed to allow
     * proxy contracts to mint on others behalf. The `owner` will be able to remove
     * the deposited collateral after series expiration or by calling unmint(), even
     * if a third-party minted options on its behalf.
     *
     * @param amountOfOptions The amount option tokens to be issued
     * @param owner Which address will be the owner of the options
     */
    function mint(uint256 amountOfOptions, address owner) external;

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
    function exercise(uint256 amountOfOptions) external;

    /**
     * @notice After series expiration in case of American or after exercise window for European,
     * allow minters who have locked their collateral to withdraw them proportionally
     * to their minted options.
     *
     * @dev If assets had been exercised during the option series the minter may withdraw
     * the exercised assets or a combination of exercised and collateral.
     */
    function withdraw() external;

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
    function unmint(uint256 amountOfOptions) external;

    function optionType() external view returns (OptionType);

    function exerciseType() external view returns (ExerciseType);

    function underlyingAsset() external view returns (address);

    function underlyingAssetDecimals() external view returns (uint8);

    function strikeAsset() external view returns (address);

    function strikeAssetDecimals() external view returns (uint8);

    function strikePrice() external view returns (uint256);

    function strikePriceDecimals() external view returns (uint8);

    function expiration() external view returns (uint256);

    function startOfExerciseWindow() external view returns (uint256);

    function hasExpired() external view returns (bool);

    function isTradeWindow() external view returns (bool);

    function isExerciseWindow() external view returns (bool);

    function isWithdrawWindow() external view returns (bool);

    function strikeToTransfer(uint256 amountOfOptions) external view returns (uint256);

    function getSellerWithdrawAmounts(address owner)
        external
        view
        returns (uint256 strikeAmount, uint256 underlyingAmount);

    function underlyingReserves() external view returns (uint256);

    function strikeReserves() external view returns (uint256);
}
