// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

// TODO: add other methods

interface IPriceProvider {
    function getAssetPrice(address _asset) external view returns (uint256);

    function getAssetDecimals(address _asset) external view returns (uint256);
}
