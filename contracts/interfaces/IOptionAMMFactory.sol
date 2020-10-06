pragma solidity ^0.6.8;

interface IOptionAMMFactory {
    function createExchange(address _optionAddress, address _stableAsset) external returns (address);

    function getExchange(address _optionAddress) external view returns (address);
}
