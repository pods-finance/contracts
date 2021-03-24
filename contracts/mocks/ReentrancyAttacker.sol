pragma solidity 0.6.12;

interface IReentrancySample {
    function one() external;

    function two() external;
}

contract ReentrancyAttacker {

    function zapper(address sampleAddress) public {
        IReentrancySample reentrancySample = IReentrancySample(sampleAddress);
        reentrancySample.one();
        reentrancySample.two();
    }

    function oneProxy(address sampleAddress) public {
        IReentrancySample reentrancySample = IReentrancySample(sampleAddress);
        reentrancySample.one();
    }

    function twoProxy(address sampleAddress) public {
        IReentrancySample reentrancySample = IReentrancySample(sampleAddress);
        reentrancySample.two();
    }
}
