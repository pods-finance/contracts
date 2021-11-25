// SPDX-License-Identifier: agpl-3.0
pragma solidity >=0.6.12;

import "./IPodOption.sol";

interface IOptionHelper {
    function mint(IPodOption option, uint256 optionAmount) external;

    function mintAndSellOptions(
        IPodOption option,
        uint256 optionAmount,
        uint256 minTokenAmount,
        uint256 deadline,
        uint256 initialIVGuess
    ) external;

    function mintAndAddLiquidity(
        IPodOption option,
        uint256 optionAmount,
        uint256 tokenAmount
    ) external;

    function mintAndAddLiquidityWithCollateral(IPodOption option, uint256 collateralAmount) external;

    function addLiquidity(
        IPodOption option,
        uint256 optionAmount,
        uint256 tokenAmount
    ) external;

    function sellExactOptions(
        IPodOption option,
        uint256 optionAmount,
        uint256 minTokenReceived,
        uint256 deadline,
        uint256 initialIVGuess
    ) external;

    function sellOptionsAndReceiveExactTokens(
        IPodOption option,
        uint256 maxOptionAmount,
        uint256 exactTokenReceived,
        uint256 deadline,
        uint256 initialIVGuess
    ) external;

    function buyExactOptions(
        IPodOption option,
        uint256 optionAmount,
        uint256 maxTokenAmount,
        uint256 deadline,
        uint256 initialIVGuess
    ) external;

    function buyOptionsWithExactTokens(
        IPodOption option,
        uint256 minOptionAmount,
        uint256 tokenAmount,
        uint256 deadline,
        uint256 initialIVGuess
    ) external;
}
