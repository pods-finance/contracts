pragma solidity ^0.6.8;

interface IOptionAMMFactory {
    function getExchange(address _optionAddress) external view returns (address);

    function createExchange(address _optionAddress, address _stableAsset) external returns (address);
}
