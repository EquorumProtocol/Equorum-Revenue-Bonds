// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../RevenueSeries.sol";

contract MaliciousReceiver {
    RevenueSeries public series;
    bool public attacking;
    uint256 public attackCount;

    constructor(address payable _series) {
        series = RevenueSeries(_series);
    }

    function attack() external {
        attacking = true;
        attackCount = 0;
        series.claimRevenue();
    }

    function attackClaimFor() external {
        attacking = true;
        attackCount = 0;
        series.claimFor(address(this));
    }

    receive() external payable {
        if (attacking) {
            try series.claimRevenue() {
                // If this succeeds, reentrancy was NOT blocked (bad)
                attackCount++;
            } catch {
                // Expected to fail - reentrancy blocked (good)
            }
            attacking = false; // Only try once
        }
    }
}
