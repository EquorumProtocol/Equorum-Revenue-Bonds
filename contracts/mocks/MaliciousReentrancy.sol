// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MaliciousReentrancy
 * @notice Mock contract to test re-entrancy protection
 */
contract MaliciousReentrancy {
    address public target;
    bool public attacking;
    uint256 public attackCount;
    
    constructor(address _target) {
        target = _target;
    }
    
    function attack() external {
        attacking = true;
        attackCount = 0;
        // Trigger the first call
        (bool success, ) = target.call(abi.encodeWithSignature("claimRevenue()"));
        require(success, "Initial attack failed");
    }
    
    receive() external payable {
        if (attacking && attackCount < 3) {
            attackCount++;
            // Try to re-enter
            (bool success, ) = target.call(abi.encodeWithSignature("claimRevenue()"));
            // Should fail due to nonReentrant guard
        }
    }
}
