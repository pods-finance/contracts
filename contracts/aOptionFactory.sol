// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "./waPodPut.sol";
import "./aPodPut.sol";

contract aOptionFactory {
    aPodPut[] public options;
    address public WETH_ADDRESS;

    event OptionCreated(
        address indexed deployer,
        aPodPut option,
        address underlyingAsset,
        address strikeAsset,
        uint256 strikePrice,
        uint256 expiration
    );

    constructor(address wethAddress) public {
        WETH_ADDRESS = wethAddress;
    }

    /**
     * @notice creates a new aPodPut Contract
     * @param _name The option token name. Eg. "Pods Put WBTC-aUSDC 5000 2020-02-23"
     * @param _symbol The option token symbol. Eg. "podWBTC:20AA"
     * @param _optionType The option type. Eg. "0 for Put, 1 for Call"
     * @param _underlyingAsset The underlying asset. Eg. "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
     * @param _strikeAsset The strike asset. Eg. "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
     * @param _strikePrice The option strike price including decimals (strikePriceDecimals == strikeAssetDecimals), Eg, 5000000000
     * @param _expiration The Expiration Option date in UNIX timestamp. E.g 1600178324
     */
    function createOption(
        string memory _name,
        string memory _symbol,
        PodOption.OptionType _optionType,
        address _underlyingAsset,
        address _strikeAsset,
        uint256 _strikePrice,
        uint256 _expiration
    ) public returns (aPodPut) {
        require(_expiration > block.timestamp, "Expiration should be in the future time");

        aPodPut option = new aPodPut(
            _name,
            _symbol,
            _optionType,
            _underlyingAsset,
            _strikeAsset,
            _strikePrice,
            _expiration
        );

        options.push(option);
        emit OptionCreated(msg.sender, option, _underlyingAsset, _strikeAsset, _strikePrice, _expiration);
        return option;
    }

    /**
     * @notice creates a new waPodPut Contract
     * @param _name The option token name. Eg. "aPods Put ETH-USDC 5000 2020-02-23"
     * @param _symbol The option token symbol. Eg. "podETH:20AA"
     * @param _optionType The option type. Eg. "0 for Put, 1 for Call"
     * @param _strikeAsset The strike asset. Eg. "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
     * @param _strikePrice The option strike price including decimals (strikePriceDecimals == strikeAssetDecimals), Eg, 5000000000
     * @param _expiration The Expiration Option date in UNIX timestamp. E.g 1600178324
     */

    function createEthOption(
        string memory _name,
        string memory _symbol,
        PodOption.OptionType _optionType,
        address _strikeAsset,
        uint256 _strikePrice,
        uint256 _expiration
    ) public returns (waPodPut) {
        require(_expiration > block.timestamp, "Expiration should be in the future time");

        waPodPut option = new waPodPut(
            _name,
            _symbol,
            _optionType,
            WETH_ADDRESS,
            _strikeAsset,
            _strikePrice,
            _expiration
        );

        options.push(option);
        emit OptionCreated(msg.sender, option, WETH_ADDRESS, _strikeAsset, _strikePrice, _expiration);
        return option;
    }
}
