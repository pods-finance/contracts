pragma solidity 0.8.4;

import "../interfaces/IConfigurationManager.sol";
import "../interfaces/IOptionPoolRegistry.sol";

/**
 * @title OptionPoolRegistry
 * @author Pods Finance
 * @notice Tracks the OptionAMMPool instances associated with Options
 */
contract OptionPoolRegistry is IOptionPoolRegistry {
    IConfigurationManager public immutable configurationManager;

    mapping(address => address) private _registry;

    constructor(IConfigurationManager _configurationManager) public {
        configurationManager = _configurationManager;
    }

    modifier onlyAMMFactory {
        require(
            msg.sender == configurationManager.getAMMFactory(),
            "OptionPoolRegistry: caller is not current AMMFactory"
        );
        _;
    }

    /**
     * @notice Returns the address of a previously created pool
     *
     * @dev If the pool is not registered it will return address(0)
     *
     * @param option The address of option token
     * @return The address of the pool
     */
    function getPool(address option) external override view returns (address) {
        return _registry[option];
    }

    /**
     * @notice Register a pool for a given option
     *
     * @param option The address of option token
     * @param pool The address of OptionAMMPool
     */
    function setPool(address option, address pool) external override onlyAMMFactory {
        _registry[option] = pool;
        emit PoolSet(msg.sender, option, pool);
    }
}
