// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "./PodCall.sol";
import "../interfaces/IPodOption.sol";
import "../interfaces/IOptionBuilder.sol";

/**
 * @title PodCallBuilder
 * @author Pods Finance
 * @notice Builds PodCall options
 */
contract PodCallBuilder is IOptionBuilder {
    /**
     * @notice creates a new PodCall Contract
     * @param name The option token name. Eg. "Pods Call WBTC-USDC 5000 2020-02-23"
     * @param symbol The option token symbol. Eg. "podWBTC:20AA"
     * @param exerciseType The option exercise type. Eg. "0 for European, 1 for American"
     * @param underlyingAsset The underlying asset. Eg. "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
     * @param strikeAsset The strike asset. Eg. "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
     * @param strikePrice The option strike price including decimals. e.g. 5000000000
     * @param expiration The Expiration Option date in seconds. e.g. 1600178324
     * @param exerciseWindowSize The Expiration Window Size duration in seconds. E.g 24*60*60 (24h)
     */
    function buildOption(
        string memory name,
        string memory symbol,
        IPodOption.ExerciseType exerciseType,
        address underlyingAsset,
        address strikeAsset,
        uint256 strikePrice,
        uint256 expiration,
        uint256 exerciseWindowSize,
        IConfigurationManager configurationManager
    ) external override returns (IPodOption) {
        PodCall option = new PodCall(
            name,
            symbol,
            exerciseType,
            underlyingAsset,
            strikeAsset,
            strikePrice,
            expiration,
            exerciseWindowSize,
            configurationManager
        );

        return option;
    }
}
