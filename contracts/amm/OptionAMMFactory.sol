pragma solidity ^0.6.8;

import "../interfaces/IOptionAMMFactory.sol";
import "./OptionAMMExchange.sol";

/**
 * OptionAMMFactory
 */
contract OptionAMMFactory is IOptionAMMFactory {
    mapping(address => OptionAMMExchange) private exchanges;

    event ExchangeCreated(address indexed deployer, OptionAMMExchange exchange);

    /**
     * Returns the address of a previously created exchange
     *
     * @dev If the exchange has not been created it will return address(0)
     *
     * @param _optionAddress The address of option token
     * @return The address of the exchange
     */
    function getExchange(address _optionAddress) external override view returns (address) {
        return address(exchanges[_optionAddress]);
    }

    /**
     * Creates an option exchange
     *
     * @param _optionAddress The address of option token
     * @param _stableAsset A stablecoin asset address
     * @return The address of the newly created exchange
     */
    function createExchange(
        address _optionAddress,
        address _stableAsset,
        address _priceProvider,
        address _priceMethod,
        address _sigma
    ) external override returns (address) {
        require(address(exchanges[_optionAddress]) == address(0), "Exchange already exists");

        OptionAMMExchange exchange = new OptionAMMExchange(
            _optionAddress,
            _stableAsset,
            _priceProvider,
            _priceMethod,
            _sigma
        );

        exchanges[_optionAddress] = exchange;
        emit ExchangeCreated(msg.sender, exchange);

        return address(exchange);
    }
}
