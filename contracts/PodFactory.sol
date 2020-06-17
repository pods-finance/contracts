// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "./PodToken.sol";

contract PodFactory {

    address[] public options;

    event OptionCreated(address addr);

    /**
     * @notice creates a new Pod Contract
     * @param _name The option token name. Eg. "Pods Put WBTC-USDC 5000 2020-02-23"
     * @param _symbol The option token symbol. Eg. "podWBTC:20AA"
     * @param _optionType The option type. Eg. "0 for Put, 1 for Call"
     * @param _underlyingAddress The underlying asset. Eg. "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
     * @param _strikeAddress The strike asset. Eg. "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
     * @param _strikePrice The option strike price including decimals (strikePriceDecimals == strikeAssetDecimals), Eg, 5000000000
     * @param _expirationDate The Expiration Option date in blocknumbers. E.g 19203021
     */
    function createOption(
        string memory _name,
        string memory _symbol,
        uint8 _optionType,
        address _underlyingAddress,
        uint256 _strikeAddress,
        uint256 _strikePrice,
        uint256 _expirationDate
    ) public returns (address) {
        require(_expirationDate > block.number, "expiration lower than current block");

        PodToken option = new PodToken(
            _name,
            _symbol,
            _optionType,
            _underlyingAddress,
            _strikeAddress,
            _strikePrice,
           _expirationDate
        );

        options.push(address(option));
        emit OptionCreated(address(option));

        return address(option);
    }

    /**
     * @notice The number of Option Pod Contracts that ha been created
     */
    function getNumberOfOptions() public view returns (uint256) {
        return options.length;
    }