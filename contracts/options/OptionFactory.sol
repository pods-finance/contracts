// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "../interfaces/IOptionBuilder.sol";
import "./PodOption.sol";

contract OptionFactory {
    address[] public options;
    IOptionBuilder public podPutBuilder;
    IOptionBuilder public wPodPutBuilder;
    address public WETH_ADDRESS;

    event OptionCreated(
        address indexed deployer,
        address option,
        PodOption.OptionType _optionType,
        PodOption.ExerciseType _exerciseType,
        address underlyingAsset,
        address strikeAsset,
        uint256 strikePrice,
        uint256 expiration,
        uint256 exerciseWindowSize
    );

    constructor(
        address wethAddress,
        address _PodPutBuilder,
        address _WPodPutBuilder
    ) public {
        WETH_ADDRESS = wethAddress;
        podPutBuilder = IOptionBuilder(_PodPutBuilder);
        wPodPutBuilder = IOptionBuilder(_WPodPutBuilder);
    }

    /**
     * @notice creates a new PodPut Contract
     * @param _name The option token name. Eg. "Pods Put WBTC-USDC 5000 2020-02-23"
     * @param _symbol The option token symbol. Eg. "podWBTC:20AA"
     * @param _optionType The option type. Eg. "0 for Put / 1 for Calls"
     * @param _exerciseType The option exercise type. Eg. "0 for European, 1 for American"
     * @param _underlyingAsset The underlying asset. Eg. "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
     * @param _strikeAsset The strike asset. Eg. "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
     * @param _strikePrice The option strike price including decimals (strikePriceDecimals == strikeAssetDecimals), Eg, 5000000000
     * @param _expiration The Expiration Option date in UNIX timestamp. E.g 1600178324
     * @param _exerciseWindowSize The Expiration Window Size duration in UNIX timestamp. E.g 24*60*60 (24h)
     */
    function createOption(
        string memory _name,
        string memory _symbol,
        PodOption.OptionType _optionType,
        PodOption.ExerciseType _exerciseType,
        address _underlyingAsset,
        address _strikeAsset,
        uint256 _strikePrice,
        uint256 _expiration,
        uint256 _exerciseWindowSize
    ) public returns (address option) {
        IOptionBuilder builder;

        if (_optionType == PodOption.OptionType.PUT) {
            if (_underlyingAsset == WETH_ADDRESS) {
                builder = wPodPutBuilder;
            } else {
                builder = podPutBuilder;
            }
        } else {
            // PodCall
        }

        option = builder.buildOption(
            _name,
            _symbol,
            _exerciseType,
            _underlyingAsset,
            _strikeAsset,
            _strikePrice,
            _expiration,
            _exerciseWindowSize
        );

        options.push(option);

        emit OptionCreated(
            msg.sender,
            option,
            _optionType,
            _exerciseType,
            _underlyingAsset,
            _strikeAsset,
            _strikePrice,
            _expiration,
            _exerciseWindowSize
        );
        return option;
    }
}
