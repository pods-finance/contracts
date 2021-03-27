// SPDX-License-Identifier: agpl-3.0

pragma solidity 0.6.12;

interface ICombinedSample {
    function one() external;

    function two() external;
}

contract CombinedAttacker {
    function zapper(address sampleAddress) public {
        ICombinedSample flashloanSample = ICombinedSample(sampleAddress);
        flashloanSample.one();
        flashloanSample.two();
    }

    function oneProxy(address sampleAddress) public {
        ICombinedSample flashloanSample = ICombinedSample(sampleAddress);
        flashloanSample.one();
    }

    function twoProxy(address sampleAddress) public {
        ICombinedSample flashloanSample = ICombinedSample(sampleAddress);
        flashloanSample.two();
    }
}
