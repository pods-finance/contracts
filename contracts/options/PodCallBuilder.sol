// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./PodCall.sol";
import "./PodOption.sol";
import "../interfaces/IOptionBuilder.sol";

/**
 * @title PodCallBuilder
 * @author Pods Finance
 * @notice Builds PodCall options
 */
contract PodCallBuilder is IOptionBuilder {
    /**
     * @notice creates a new PodPut Contract
     * @param _name The option token name. Eg. "Pods Put WBTC-USDC 5000 2020-02-23"
     * @param _symbol The option token symbol. Eg. "podWBTC:20AA"
     * @param _exerciseType The option exercise type. Eg. "0 for European, 1 for American"
     * @param _underlyingAsset The underlying asset. Eg. "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
     * @param _strikeAsset The strike asset. Eg. "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
     * @param _strikePrice The option strike price including decimals. e.g. 5000000000
     * @param _expiration The Expiration Option date in UNIX timestamp. e.g. 1600178324
     * @param _exerciseWindowSize The Expiration Window Size duration in UNIX timestamp. E.g 24*60*60 (24h)
     */
    function buildOption(
        string memory _name,
        string memory _symbol,
        IPodOption.ExerciseType _exerciseType,
        address _underlyingAsset,
        address _strikeAsset,
        uint256 _strikePrice,
        uint256 _expiration,
        uint256 _exerciseWindowSize
    ) public override returns (PodOption) {
        PodCall option = new PodCall(
            _name,
            _symbol,
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
