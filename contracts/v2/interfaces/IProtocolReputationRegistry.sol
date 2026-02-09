// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IProtocolReputationRegistry
 * @notice Interface for the Protocol Reputation Registry
 * @dev Implemented by ProtocolReputationRegistry, used by RevenueSeries
 */
interface IProtocolReputationRegistry {
    /**
     * @notice Record a revenue distribution
     * @param protocol Protocol address
     * @param amount Amount distributed
     */
    function recordDistribution(address protocol, uint256 amount) external;
    
    /**
     * @notice Register a new series
     * @param protocol Protocol address
     * @param series Series address
     * @param expectedRevenue Expected revenue
     * @param expectedCadenceDays Expected payment frequency
     */
    function registerSeries(
        address protocol,
        address series,
        uint256 expectedRevenue,
        uint256 expectedCadenceDays
    ) external;
    
    /**
     * @notice Authorize a reporter
     * @param reporter Reporter address
     */
    function authorizeReporter(address reporter) external;
    
    /**
     * @notice Get reputation score
     * @param protocol Protocol address
     * @return score Reputation score (0-100)
     */
    function getReputationScore(address protocol) external view returns (uint256 score);
    
    /**
     * @notice Blacklist a protocol
     * @param protocol Protocol address
     * @param reason Reason for blacklisting
     */
    function blacklistProtocol(address protocol, string calldata reason) external;
    
    /**
     * @notice Report a protocol default (callable by authorized reporters)
     * @param protocol Protocol address that defaulted
     * @param reason Reason for default
     */
    function reportDefault(address protocol, string calldata reason) external;
}
