// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

import "@openzeppelin/contracts/utils/Address.sol";
import "../interfaces/IConfigurationManager.sol";
import "../interfaces/IOptionAMMFactory.sol";
import "../interfaces/IFeePoolBuilder.sol";
import "./OptionAMMPool.sol";
import "../interfaces/IOptionPoolRegistry.sol";

/**
 * @title OptionAMMFactory
 * @author Pods Finance
 * @notice Creates and store new OptionAMMPool
 */
contract OptionAMMFactory is IOptionAMMFactory {
    /**
     * @dev store globally accessed configurations
     */
    IConfigurationManager public immutable configurationManager;

    /**
     * @dev store globally accessed configurations
     */
    IFeePoolBuilder public immutable feePoolBuilder;

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
        IOptionPoolRegistry registry = IOptionPoolRegistry(configurationManager.getOptionPoolRegistry());
        require(registry.getPool(_optionAddress) == address(0), "OptionAMMFactory: Pool already exists");

        OptionAMMPool pool = new OptionAMMPool(
            _optionAddress,
            _stableAsset,
            _initialIV,
            configurationManager,
            feePoolBuilder
        );

        address poolAddress = address(pool);
        registry.setPool(_optionAddress, poolAddress);

        return poolAddress;
    }
}
