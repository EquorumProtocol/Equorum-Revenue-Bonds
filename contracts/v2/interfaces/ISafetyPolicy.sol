// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ISafetyPolicy
 * @notice Interface for pluggable safety validation policies
 * @dev Allows additional restrictions beyond core hardcoded limits
 * @dev Policy can ONLY make rules MORE restrictive, never less
 * @dev Policy should ideally be deterministic for auditability
 * @dev view allows flexibility for dynamic policies if needed
 */
interface ISafetyPolicy {
    /**
     * @notice Marker function to validate interface implementation
     * @dev Used by Factory to ensure correct policy contract
     * @return Always returns true for valid ISafetyPolicy implementation
     */
    function isSafetyPolicy() external pure returns (bool);
    
    /**
     * @notice Validate series parameters for additional safety checks
     * @dev This is called AFTER core hardcoded validation
     * @dev Should revert if parameters don't meet policy requirements
     * @param protocol Protocol creating the series
     * @param revenueShareBPS Revenue share in basis points
     * @param durationDays Duration in days
     * @param totalSupply Total token supply
     * @param minDistributionAmount Minimum distribution amount
     */
    function validateParams(
        address protocol,
        uint256 revenueShareBPS,
        uint256 durationDays,
        uint256 totalSupply,
        uint256 minDistributionAmount
    ) external view;
}
