// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "./PodToken.sol";
import "./constants/ConstantAddresses.sol";

contract PodFactory is ConstantAddresses {
    PodToken[] public options;

    event OptionCreated(address indexed deployer, PodToken option, address exchange);

    /**
     * @notice creates a new Pod Contract
     * @param _name The option token name. Eg. "Pods Put WBTC-USDC 5000 2020-02-23"
     * @param _symbol The option token symbol. Eg. "podWBTC:20AA"
     * @param _optionType The option type. Eg. "0 for Put, 1 for Call"
     * @param _underlyingAsset The underlying asset. Eg. "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
     * @param _strikeAsset The strike asset. Eg. "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
     * @param _strikePrice The option strike price including decimals (strikePriceDecimals == strikeAssetDecimals), Eg, 5000000000
     * @param _expirationDate The Expiration Option date in blocknumbers. E.g 19203021
     */
    function createOption(
        string memory _name,
        string memory _symbol,
        OptionCore.OptionType _optionType,
        address _underlyingAsset,
        address _strikeAsset,
        uint256 _strikePrice,
        uint256 _expirationDate
    ) public returns (address, address exchange) {
        require(_expirationDate > block.number, "expiration lower than current block");

        PodToken option = new PodToken(
            _name,
            _symbol,
            _optionType,
            _underlyingAsset,
            _strikeAsset,
            _strikePrice,
            _expirationDate
        );

        options.push(option);

        // Create Uniswap Exchange
        try IUniswapFactory(UNISWAPV1_FACTORY).createExchange(address(option)) returns (address _exchange) {
            emit OptionCreated(msg.sender, option, _exchange);
            return (address(option), _exchange);
        } catch {
            revert("Exchange creation error");
        }
    }
}
