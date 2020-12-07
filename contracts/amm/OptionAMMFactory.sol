// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "../interfaces/IOptionAMMFactory.sol";
import "./OptionAMMPool.sol";
import "./FeePool.sol";

/**
 * @title OptionAMMFactory
 * @author Pods Finance
 * @notice Creates and store new OptionAMMPool
 */
contract OptionAMMFactory is IOptionAMMFactory {
    mapping(address => OptionAMMPool) private pools;

    event PoolCreated(address indexed deployer, OptionAMMPool pool);

    /**
     * @notice Returns the address of a previously created pool
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
     * @notice Creates an option pool
     *
     * @param _optionAddress The address of option token
     * @param _stableAsset A stablecoin asset address
     * @param _priceProvider contract address of the PriceProvider contract for spotPrice
     * @param _priceMethod contract address of the PriceMethod contract (E.g: BlackScholes)
     * @param _sigma contract address of the sigma (implied Volatility) contract
     * @param _initialSigma Initial number of sigma (implied volatility)
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
        require(address(pools[_optionAddress]) == address(0), "OptionAMMFactory: Pool already exists");

        FeePool feePoolTokenA = new FeePool(_stableAsset, 15, 6);
        FeePool feePoolTokenB = new FeePool(_stableAsset, 15, 6);

        OptionAMMPool pool = new OptionAMMPool(
            _optionAddress,
            _stableAsset,
            _priceProvider,
            _priceMethod,
            _sigma,
            _initialSigma,
            address(feePoolTokenA),
            address(feePoolTokenB)
        );

        feePoolTokenA.transferOwnership(address(pool));
        feePoolTokenB.transferOwnership(address(pool));

        pools[_optionAddress] = pool;
        emit PoolCreated(msg.sender, pool);

        return address(pool);
    }
}
