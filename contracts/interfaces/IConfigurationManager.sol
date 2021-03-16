// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface IConfigurationManager {
    function setEmergencyStop(address emergencyStop) external;

    function setPricingMethod(address pricingMethod) external;

    function setImpliedVolatility(address impliedVolatility) external;

    function setPriceProvider(address priceProvider) external;

    function setCapProvider(address capProvider) external;

    function setAMMFactory(address ammFactory) external;

    function getEmergencyStop() external view returns (address);

    function getPricingMethod() external view returns (address);

    function getImpliedVolatility() external view returns (address);

    function getPriceProvider() external view returns (address);

    function getCapProvider() external view returns (address);

    function getAMMFactory() external view returns (address);
}
