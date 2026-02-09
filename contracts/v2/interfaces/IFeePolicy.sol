// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IFeePolicy
 * @notice Interface for pluggable fee calculation policies
 * @dev Allows flexible fee structures without changing core Factory
 */
interface IFeePolicy {
    /**
     * @notice Marker function to validate interface implementation
     * @dev Used by Factory to ensure correct policy contract
     * @return Always returns true for valid IFeePolicy implementation
     */
    function isFeePolicy() external pure returns (bool);
    
    /**
     * @notice Policy version for upgrade tracking
     * @dev Helps community understand policy upgrades
     * @return version Version number (1, 2, 3, etc)
     */
    function feePolicyVersion() external pure returns (uint256);
    
    /**
     * @notice Calculate creation fee and receiver for a new series
     * @dev Receives full context to enable sophisticated fee logic
     * @param protocol Protocol creating the series
     * @param revenueShareBPS Revenue share in basis points (e.g., 2000 = 20%)
     * @param durationDays Duration of the series in days
     * @param totalSupply Total token supply for the series
     * @param minDistributionAmount Minimum distribution amount (can affect fee tier)
     * @return fee Amount of ETH required as creation fee
     * @return receiver Address that should receive the fee (treasury, burn, split, etc)
     */
    function getFeeQuote(
        address protocol,
        uint256 revenueShareBPS,
        uint256 durationDays,
        uint256 totalSupply,
        uint256 minDistributionAmount
    ) external view returns (uint256 fee, address receiver);
}
