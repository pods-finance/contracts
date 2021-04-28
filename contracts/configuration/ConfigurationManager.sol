// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./ModuleStorage.sol";
import "../interfaces/IConfigurationManager.sol";

/**
 * @title ConfigurationManager
 * @author Pods Finance
 * @notice Allows contracts to read protocol-wide configuration modules
 */
contract ConfigurationManager is IConfigurationManager, ModuleStorage, Ownable {
    mapping(bytes32 => uint256) private _parameters;

    /* solhint-disable private-vars-leading-underscore */
    bytes32 private constant EMERGENCY_STOP = "EMERGENCY_STOP";
    bytes32 private constant PRICING_METHOD = "PRICING_METHOD";
    bytes32 private constant SIGMA_GUESSER = "SIGMA_GUESSER";
    bytes32 private constant PRICE_PROVIDER = "PRICE_PROVIDER";
    bytes32 private constant CAP_PROVIDER = "CAP_PROVIDER";
    bytes32 private constant AMM_FACTORY = "AMM_FACTORY";
    bytes32 private constant OPTION_FACTORY = "OPTION_FACTORY";
    bytes32 private constant OPTION_HELPER = "OPTION_HELPER";

    /* solhint-enable private-vars-leading-underscore */

    event ParameterSet(bytes32 name, uint256 value);

    constructor() public {
        /**
         * Minimum price interval to accept a price feed
         * Defaulted to 3 hours and 10 minutes
         */
        _parameters["MIN_UPDATE_INTERVAL"] = 11100;

        /**
         * Acceptable range interval on sigma numerical method
         */
        _parameters["GUESSER_ACCEPTABLE_RANGE"] = 10;
    }

    function setParameter(bytes32 name, uint256 value) external override onlyOwner {
        _parameters[name] = value;
        emit ParameterSet(name, value);
    }

    function setEmergencyStop(address emergencyStop) external override onlyOwner {
        _setModule(EMERGENCY_STOP, emergencyStop);
    }

    function setPricingMethod(address pricingMethod) external override onlyOwner {
        _setModule(PRICING_METHOD, pricingMethod);
    }

    function setSigmaGuesser(address sigmaGuesser) external override onlyOwner {
        _setModule(SIGMA_GUESSER, sigmaGuesser);
    }

    function setPriceProvider(address priceProvider) external override onlyOwner {
        _setModule(PRICE_PROVIDER, priceProvider);
    }

    function setCapProvider(address capProvider) external override onlyOwner {
        _setModule(CAP_PROVIDER, capProvider);
    }

    function setAMMFactory(address ammFactory) external override onlyOwner {
        _setModule(AMM_FACTORY, ammFactory);
    }

    function setOptionFactory(address optionFactory) external override onlyOwner {
        _setModule(OPTION_FACTORY, optionFactory);
    }

    function setOptionHelper(address optionHelper) external override onlyOwner {
        _setModule(OPTION_HELPER, optionHelper);
    }

    function getParameter(bytes32 name) external override view returns (uint256) {
        return _parameters[name];
    }

    function getEmergencyStop() external override view returns (address) {
        return getModule(EMERGENCY_STOP);
    }

    function getPricingMethod() external override view returns (address) {
        return getModule(PRICING_METHOD);
    }

    function getSigmaGuesser() external override view returns (address) {
        return getModule(SIGMA_GUESSER);
    }

    function getPriceProvider() external override view returns (address) {
        return getModule(PRICE_PROVIDER);
    }

    function getCapProvider() external override view returns (address) {
        return getModule(CAP_PROVIDER);
    }

    function getAMMFactory() external override view returns (address) {
        return getModule(AMM_FACTORY);
    }

    function getOptionFactory() external override view returns (address) {
        return getModule(OPTION_FACTORY);
    }

    function getOptionHelper() external override view returns (address) {
        return getModule(OPTION_HELPER);
    }
}
