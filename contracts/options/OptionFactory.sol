// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "../interfaces/IOptionBuilder.sol";
import "../interfaces/IPodOption.sol";

/**
 * @title OptionFactory
 * @author Pods Finance
 * @notice Creates and store new Options Series
 * @dev Uses IOptionBuilder to create the different types of Options
 */
contract OptionFactory {
    IConfigurationManager public configurationManager;
    IOptionBuilder public podPutBuilder;
    IOptionBuilder public wPodPutBuilder;
    IOptionBuilder public podCallBuilder;
    IOptionBuilder public wPodCallBuilder;
    address public WETH_ADDRESS;

    event OptionCreated(
        address indexed deployer,
        address option,
        IPodOption.OptionType _optionType,
        IPodOption.ExerciseType _exerciseType,
        address underlyingAsset,
        address strikeAsset,
        uint256 strikePrice,
        uint256 expiration,
        uint256 exerciseWindowSize
    );

    constructor(
        address wethAddress,
        address PodPutBuilder,
        address WPodPutBuilder,
        address PodCallBuilder,
        address WPodCallBuilder,
        address ConfigurationManager
    ) public {
        WETH_ADDRESS = wethAddress;
        configurationManager = IConfigurationManager(ConfigurationManager);
        podPutBuilder = IOptionBuilder(PodPutBuilder);
        wPodPutBuilder = IOptionBuilder(WPodPutBuilder);
        podCallBuilder = IOptionBuilder(PodCallBuilder);
        wPodCallBuilder = IOptionBuilder(WPodCallBuilder);
    }

    /**
     * @notice Creates a new Option Series
     * @param name The option token name. Eg. "Pods Put WBTC-USDC 5000 2020-02-23"
     * @param symbol The option token symbol. Eg. "podWBTC:20AA"
     * @param optionType The option type. Eg. "0 for Put / 1 for Calls"
     * @param exerciseType The option exercise type. Eg. "0 for European, 1 for American"
     * @param underlyingAsset The underlying asset. Eg. "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
     * @param strikeAsset The strike asset. Eg. "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
     * @param strikePrice The option strike price including decimals. e.g. 5000000000
     * @param expiration The Expiration Option date in seconds. e.g. 1600178324
     * @param exerciseWindowSize The Expiration Window Size duration in seconds. E.g 24*60*60 (24h)
     * @return option The address for the newly created option
     */
    function createOption(
        string memory name,
        string memory symbol,
        IPodOption.OptionType optionType,
        IPodOption.ExerciseType exerciseType,
        address underlyingAsset,
        address strikeAsset,
        uint256 strikePrice,
        uint256 expiration,
        uint256 exerciseWindowSize
    ) external returns (address) {
        IOptionBuilder builder;

        if (optionType == IPodOption.OptionType.PUT) {
            if (underlyingAsset == WETH_ADDRESS) {
                builder = wPodPutBuilder;
            } else {
                builder = podPutBuilder;
            }
        } else {
            if (underlyingAsset == WETH_ADDRESS) {
                builder = wPodCallBuilder;
            } else {
                builder = podCallBuilder;
            }
        }

        address option = address(
            builder.buildOption(
                name,
                symbol,
                exerciseType,
                underlyingAsset,
                strikeAsset,
                strikePrice,
                expiration,
                exerciseWindowSize,
                configurationManager
            )
        );

        emit OptionCreated(
            msg.sender,
            option,
            optionType,
            exerciseType,
            underlyingAsset,
            strikeAsset,
            strikePrice,
            expiration,
            exerciseWindowSize
        );

        return option;
    }
}
