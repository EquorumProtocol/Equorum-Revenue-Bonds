// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/ISafetyPolicy.sol";

/**
 * @title StrictSafetyPolicy
 * @notice More restrictive safety limits than core defaults
 * @dev Example of additional safety restrictions without weakening core
 * @dev Can ONLY make rules MORE restrictive, never less
 */
contract StrictSafetyPolicy is ISafetyPolicy {
    // More restrictive limits than core
    uint256 public constant MAX_REVENUE_SHARE_BPS = 3000;  // 30% (core allows 50%)
    uint256 public constant MIN_DURATION_DAYS = 90;        // 90 days (core requires 30)
    uint256 public constant MAX_DURATION_DAYS = 1095;      // 3 years (core allows 5)
    uint256 public constant MIN_TOTAL_SUPPLY = 10000e18;   // 10k tokens (core requires 1k)
    
    /**
     * @notice Marker function for interface validation
     */
    function isSafetyPolicy() external pure override returns (bool) {
        return true;
    }
    
    /**
     * @notice Validate parameters with stricter limits
     * @dev Called AFTER core hardcoded validation
     * @dev Reverts if parameters don't meet stricter requirements
     */
    function validateParams(
        address, // protocol
        uint256 revenueShareBPS,
        uint256 durationDays,
        uint256 totalSupply,
        uint256  // minDistributionAmount
    ) external pure override {
        require(
            revenueShareBPS <= MAX_REVENUE_SHARE_BPS,
            "Revenue share too high for strict policy"
        );
        require(
            durationDays >= MIN_DURATION_DAYS,
            "Duration too short for strict policy"
        );
        require(
            durationDays <= MAX_DURATION_DAYS,
            "Duration too long for strict policy"
        );
        require(
            totalSupply >= MIN_TOTAL_SUPPLY,
            "Supply too low for strict policy"
        );
    }
}
