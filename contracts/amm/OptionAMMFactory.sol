pragma solidity ^0.6.8;

import "../interfaces/IOptionAMMFactory.sol";
import "./OptionAMMPool.sol";

/**
 * OptionAMMFactory
 */
contract OptionAMMFactory is IOptionAMMFactory {
    mapping(address => OptionAMMPool) private pools;

    event PoolCreated(address indexed deployer, OptionAMMPool pool);

    /**
     * Returns the address of a previously created pool
     *
     * @dev If the pool has not been created it will return address(0)
     *
     * @param _optionAddress The address of option token
     * @return The address of the pool
     */
    function getPool(address _optionAddress) external override view returns (address) {
        return address(pools[_optionAddress]);
    }

    /**
     * Creates an option pool
     *
     * @param _optionAddress The address of option token
     * @param _stableAsset A stablecoin asset address
     * @return The address of the newly created pool
     */
    function createPool(
        address _optionAddress,
        address _stableAsset,
        address _priceProvider,
        address _priceMethod,
        address _sigma,
        uint256 _initialSigma
    ) external override returns (address) {
        require(address(pools[_optionAddress]) == address(0), "Pool already exists");

        OptionAMMPool pool = new OptionAMMPool(
            _optionAddress,
            _stableAsset,
            _priceProvider,
            _priceMethod,
            _sigma,
            _initialSigma
        );

        pools[_optionAddress] = pool;
        emit PoolCreated(msg.sender, pool);

        return address(pool);
    }
}
