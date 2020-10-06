pragma solidity ^0.6.8;

import "../interfaces/IOptionAMMFactory.sol";
import "./OptionAMMExchange.sol";

contract OptionAMMFactory is IOptionAMMFactory {
    mapping(address => OptionAMMExchange) private exchanges;
    address public priceProvider;
    address public blackScholes;

    event ExchangeCreated(address indexed deployer, OptionAMMExchange exchange);

    constructor(address _priceProvider, address _blackScholes) public {
        priceProvider = _priceProvider;
        blackScholes = _blackScholes;
    }

    function getExchange(address _optionAddress) external override view returns (address) {
        return address(exchanges[_optionAddress]);
    }

    function createExchange(address _optionAddress, address _stableAsset) external override returns (address) {
        require(address(exchanges[_optionAddress]) == address(0), "Exchange already exists");

        OptionAMMExchange exchange = new OptionAMMExchange(_optionAddress, _stableAsset, priceProvider, blackScholes);

        exchanges[_optionAddress] = exchange;
        emit ExchangeCreated(msg.sender, exchange);

        return address(exchange);
    }
}
