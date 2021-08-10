pragma solidity >=0.6.12;

interface IOptionPoolRegistry {
    event PoolSet(address indexed factory, address indexed option, address pool);

    function getPool(address option) external view returns (address);

    function setPool(address option, address pool) external;
}
