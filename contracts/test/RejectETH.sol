// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../RevenueSeries.sol";

/**
 * @title RejectETH
 * @notice Malicious contract that rejects ETH transfers
 * @dev Used to test if claimRevenue() loses user funds when transfer fails
 */
contract RejectETH {
    RevenueSeries public series;
    bool public shouldReject = true;
    
    constructor(address payable _series) {
        series = RevenueSeries(_series);
    }
    
    /**
     * @notice Toggle whether to reject ETH
     */
    function setShouldReject(bool _reject) external {
        shouldReject = _reject;
    }
    
    /**
     * @notice Try to claim revenue (should fail if shouldReject=true)
     */
    function attemptClaim() external {
        series.claimRevenue();
    }
    
    /**
     * @notice Reject all ETH transfers
     */
    receive() external payable {
        if (shouldReject) {
            revert("I reject your ETH");
        }
    }
}
