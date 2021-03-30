// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

interface IConfigurationManager {
    function setEmergencyStop(address emergencyStop) external;

    function setPricingMethod(address pricingMethod) external;

    function setSigmaGuesser(address sigmaGuesser) external;

    function setPriceProvider(address priceProvider) external;

    function setCapProvider(address capProvider) external;

    function setAMMFactory(address ammFactory) external;

    function setOptionFactory(address optionFactory) external;

    function setOptionHelper(address optionHelper) external;

    function getEmergencyStop() external view returns (address);

    function getPricingMethod() external view returns (address);

    function getSigmaGuesser() external view returns (address);

    function getPriceProvider() external view returns (address);

    function getCapProvider() external view returns (address);

    function getAMMFactory() external view returns (address);

    function getOptionFactory() external view returns (address);

    function getOptionHelper() external view returns (address);
}
