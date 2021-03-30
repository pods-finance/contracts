// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "@openzeppelin/contracts/utils/Address.sol";
import "../interfaces/IConfigurationManager.sol";
import "../interfaces/IOptionAMMFactory.sol";
import "./OptionAMMPool.sol";
import "./FeePool.sol";

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
    IConfigurationManager private _configurationManager;

    event PoolCreated(address indexed deployer, address pool, address option);

    constructor(address configurationManager) public {
        require(Address.isContract(configurationManager), "OptionAMMFactory: Configuration Manager is not a contract");
        _configurationManager = IConfigurationManager(configurationManager);
    }

    /**
     * @notice Creates an option pool
     *
     * @param _optionAddress The address of option token
     * @param _stableAsset A stablecoin asset address
     * @param _initialSigma Initial number of sigma (implied volatility)
     * @return The address of the newly created pool
     */
    function createPool(
        address _optionAddress,
        address _stableAsset,
        uint256 _initialSigma
    ) external override returns (address) {
        require(address(_pools[_optionAddress]) == address(0), "OptionAMMFactory: Pool already exists");

        FeePool feePoolTokenA = new FeePool(_stableAsset, 15, 6);
        FeePool feePoolTokenB = new FeePool(_stableAsset, 15, 6);

        OptionAMMPool pool = new OptionAMMPool(
            _optionAddress,
            _stableAsset,
            _initialSigma,
            address(feePoolTokenA),
            address(feePoolTokenB),
            _configurationManager
        );

        address poolAddress = address(pool);

        feePoolTokenA.transferOwnership(poolAddress);
        feePoolTokenB.transferOwnership(poolAddress);

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
