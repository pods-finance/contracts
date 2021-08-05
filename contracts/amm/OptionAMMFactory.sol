// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "@openzeppelin/contracts/utils/Address.sol";
import "../interfaces/IConfigurationManager.sol";
import "../interfaces/IOptionAMMFactory.sol";
import "../interfaces/IFeePoolBuilder.sol";
import "./OptionAMMPool.sol";

/**
 * @title OptionAMMFactory
 * @author Pods Finance
 * @notice Creates and store new OptionAMMPool
 */
contract OptionAMMFactory is IOptionAMMFactory {
    mapping(address => address) private _pools;

    /**
     * @dev store globally accessed configurations
     */
    IConfigurationManager public immutable configurationManager;

    /**
     * @dev responsible for creating new FeePool instances
     */
    IFeePoolBuilder public immutable feePoolBuilder;

    event PoolCreated(address indexed deployer, address pool, address option);

    constructor(IConfigurationManager _configurationManager, address _feePoolBuilder) public {
        require(
            Address.isContract(address(_configurationManager)),
            "OptionAMMFactory: Configuration Manager is not a contract"
        );
        require(Address.isContract(_feePoolBuilder), "OptionAMMFactory: FeePoolBuilder is not a contract");

        configurationManager = _configurationManager;

        feePoolBuilder = IFeePoolBuilder(_feePoolBuilder);
    }

    /**
     * @notice Creates an option pool
     *
     * @param _optionAddress The address of option token
     * @param _stableAsset A stablecoin asset address
     * @param _initialIV Initial number of implied volatility
     * @return The address of the newly created pool
     */
    function createPool(
        address _optionAddress,
        address _stableAsset,
        uint256 _initialIV
    ) external override returns (address) {
        require(address(_pools[_optionAddress]) == address(0), "OptionAMMFactory: Pool already exists");

        OptionAMMPool pool = new OptionAMMPool(
            _optionAddress,
            _stableAsset,
            _initialIV,
            configurationManager,
            feePoolBuilder
        );

        address poolAddress = address(pool);

        _pools[_optionAddress] = poolAddress;
        emit PoolCreated(msg.sender, poolAddress, _optionAddress);

        return poolAddress;
    }

    /**
     * @notice Returns the address of a previously created pool
     *
     * @dev If the pool has not been created it will return address(0)
     *
     * @param _optionAddress The address of option token
     * @return The address of the pool
     */
    function getPool(address _optionAddress) external override view returns (address) {
        return _pools[_optionAddress];
    }
}
