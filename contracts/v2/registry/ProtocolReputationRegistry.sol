// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IProtocolReputationRegistry.sol";

/**
 * @title ProtocolReputationRegistry
 * @notice On-chain reputation system for Revenue Bond protocols
 * @dev Tracks payment history, punctuality, and compliance
 * 
 * IMPORTANT LIMITATIONS:
 * - This registry measures PAYMENT COMPLIANCE, not revenue truth
 * - It tracks "did they pay what they promised" not "did they earn what they claimed"
 * - Protocols can game this by promising less or paying dust amounts
 * - Score is a HEURISTIC, not absolute truth
 * 
 * This registry provides transparent, immutable reputation scores based on:
 * - Delivery ratio: How much revenue was actually distributed vs promised
 * - Punctuality: Whether payments were made on time
 * - Payment history: Track record across all series
 * 
 * Scores are PUBLIC and PERMANENT - protocols cannot hide bad behavior
 * 
 * USE CASE: Trust-minimized capital raising, not trustless DeFi
 */
contract ProtocolReputationRegistry is IProtocolReputationRegistry, Ownable, ReentrancyGuard {
    
    struct ProtocolStats {
        uint256 totalSeriesCreated;      // Number of bond series issued
        uint256 totalRevenuePromised;    // Total ETH promised across all series
        uint256 totalRevenueDelivered;   // Total ETH actually distributed
        uint256 totalLatePayments;       // Number of missed/late distributions
        uint256 totalOnTimePayments;     // Number of on-time distributions
        uint256 lastPaymentTimestamp;    // Last time protocol distributed revenue
        bool blacklisted;                // Emergency blacklist flag
    }
    
    struct SeriesRecord {
        address seriesAddress;
        address protocol;                // Protocol that owns this series
        uint256 expectedRevenue;         // Expected revenue based on protocol metrics
        uint256 actualRevenue;           // Actual revenue distributed
        uint256 lastDistributionTime;
        uint256 distributionCount;
        uint256 expectedCadenceDays;     // Expected payment frequency (0 = no expectation)
        uint256 lastLateRecorded;        // Last time late payment was recorded (prevents spam)
        bool active;
    }
    
    // Protocol address => Stats
    mapping(address => ProtocolStats) public protocolStats;
    
    // Series address => Record
    mapping(address => SeriesRecord) public seriesRecords;
    
    // Protocol => Series addresses
    mapping(address => address[]) public protocolSeries;
    
    // Authorized reporters (Factory, Router, Series contracts)
    mapping(address => bool) public authorizedReporters;
    
    // Events
    event SeriesRegistered(
        address indexed protocol,
        address indexed series,
        uint256 expectedRevenue
    );
    
    event RevenueDistributed(
        address indexed protocol,
        address indexed series,
        uint256 amount,
        uint256 timestamp
    );
    
    event LatePaymentRecorded(
        address indexed protocol,
        address indexed series,
        uint256 dayslate
    );
    
    event ProtocolBlacklisted(
        address indexed protocol,
        string reason
    );
    
    event ProtocolWhitelisted(
        address indexed protocol
    );
    
    event ReporterAuthorized(
        address indexed reporter
    );
    
    event ReporterRevoked(
        address indexed reporter
    );
    
    event ExpectedRevenueUpdated(
        address indexed protocol,
        address indexed series,
        uint256 oldExpected,
        uint256 newExpected
    );
    
    constructor() Ownable(msg.sender) {}
    
    /**
     * @notice Register a new series for reputation tracking
     * @param protocol Protocol address
     * @param series Series address
     * @param expectedRevenue Expected revenue (can be 0 if unknown)
     * @param expectedCadenceDays Expected payment frequency in days (0 = no expectation)
     */
    function registerSeries(
        address protocol,
        address series,
        uint256 expectedRevenue,
        uint256 expectedCadenceDays
    ) external {
        require(authorizedReporters[msg.sender], "Not authorized");
        require(protocol != address(0), "Invalid protocol");
        require(series != address(0), "Invalid series");
        require(seriesRecords[series].seriesAddress == address(0), "Series already registered");
        
        seriesRecords[series] = SeriesRecord({
            seriesAddress: series,
            protocol: protocol,
            expectedRevenue: expectedRevenue,
            actualRevenue: 0,
            lastDistributionTime: block.timestamp,
            distributionCount: 0,
            expectedCadenceDays: expectedCadenceDays,
            lastLateRecorded: 0,
            active: true
        });
        
        protocolSeries[protocol].push(series);
        protocolStats[protocol].totalSeriesCreated++;
        protocolStats[protocol].totalRevenuePromised += expectedRevenue;
        
        emit SeriesRegistered(protocol, series, expectedRevenue);
    }
    
    /**
     * @notice Record revenue distribution
     * @dev Called by series contract itself (msg.sender = series)
     * @param protocol Protocol address
     * @param amount Amount distributed
     */
    function recordDistribution(
        address protocol,
        uint256 amount
    ) external {
        // msg.sender is the series contract
        address series = msg.sender;
        
        // Validate series is registered and active
        SeriesRecord storage record = seriesRecords[series];
        require(record.active, "Series not registered or inactive");
        require(record.protocol == protocol, "Protocol mismatch");
        
        ProtocolStats storage stats = protocolStats[protocol];
        
        record.actualRevenue += amount;
        record.lastDistributionTime = block.timestamp;
        record.distributionCount++;
        
        stats.totalRevenueDelivered += amount;
        stats.totalOnTimePayments++;
        stats.lastPaymentTimestamp = block.timestamp;
        
        emit RevenueDistributed(protocol, series, amount, block.timestamp);
    }
    
    /**
     * @notice Update expected revenue for a series (one-time only)
     * @dev Protocol can set expected revenue after creation to improve score accuracy
     * @param series Series address
     * @param newExpectedRevenue New expected revenue amount
     */
    function updateExpectedRevenue(
        address series,
        uint256 newExpectedRevenue
    ) external {
        SeriesRecord storage record = seriesRecords[series];
        require(record.active, "Series not active");
        require(msg.sender == record.protocol, "Only protocol owner");
        require(record.expectedRevenue == 0, "Already set"); // One-time only
        require(newExpectedRevenue > 0, "Invalid amount");
        
        uint256 oldExpected = record.expectedRevenue;
        record.expectedRevenue = newExpectedRevenue;
        
        // Update protocol stats
        ProtocolStats storage stats = protocolStats[record.protocol];
        stats.totalRevenuePromised += newExpectedRevenue;
        
        emit ExpectedRevenueUpdated(record.protocol, series, oldExpected, newExpectedRevenue);
    }
    
    /**
     * @notice Check and record late payment if applicable
     * @dev Anyone can call this to enforce accountability
     * @param series Series address to check
     */
    function checkAndRecordLateness(address series) external {
        SeriesRecord storage record = seriesRecords[series];
        require(record.active, "Series not active");
        require(record.expectedCadenceDays > 0, "No cadence expectation");
        
        uint256 timeSinceLastPayment = block.timestamp - record.lastDistributionTime;
        uint256 expectedInterval = record.expectedCadenceDays * 1 days;
        
        // If payment is late by more than the expected cadence
        require(timeSinceLastPayment > expectedInterval, "Not late yet");
        
        // Prevent spam: Only record once per cadence period
        require(
            block.timestamp >= record.lastLateRecorded + expectedInterval,
            "Already recorded for this period"
        );
        
        uint256 daysLate = (timeSinceLastPayment - expectedInterval) / 1 days;
        
        address protocol = record.protocol;
        protocolStats[protocol].totalLatePayments++;
        record.lastLateRecorded = block.timestamp;
        
        emit LatePaymentRecorded(protocol, series, daysLate);
    }
    
    /**
     * @notice Calculate reputation score (0-100) with volume weighting
     * @dev Prevents "dust farming" by weighting series by their promised revenue
     * @param protocol Protocol address
     * @return score Reputation score
     */
    function getReputationScore(address protocol) external view returns (uint256 score) {
        ProtocolStats memory stats = protocolStats[protocol];
        
        if (stats.blacklisted) return 0;
        if (stats.totalSeriesCreated == 0) return 50; // Neutral for new protocols
        
        // Check if protocol has series but no revenue promised (transparency penalty)
        if (stats.totalSeriesCreated > 0 && stats.totalRevenuePromised == 0) {
            return 25; // Low score for avoiding commitment
        }
        
        // Calculate weighted delivery score based on volume
        uint256 deliveryScore = _calculateWeightedDeliveryScore(protocol);
        
        // Punctuality score (weighted by series volume to prevent gaming)
        uint256 reliabilityScore = _calculateWeightedReliabilityScore(protocol);
        
        score = deliveryScore + reliabilityScore;
        
        // Penalty for inactivity (no payment in 90 days)
        if (stats.lastPaymentTimestamp > 0 && block.timestamp > stats.lastPaymentTimestamp + 90 days) {
            score = score / 2;
        }
        
        return score;
    }
    
    /**
     * @notice Calculate weighted reliability score based on payment punctuality
     * @dev Uses global stats weighted by series volume to prevent gaming
     * @param protocol Protocol address
     * @return reliabilityScore Weighted reliability score (0-50)
     */
    function _calculateWeightedReliabilityScore(address protocol) internal view returns (uint256 reliabilityScore) {
        ProtocolStats memory stats = protocolStats[protocol];
        
        uint256 totalPayments = stats.totalOnTimePayments + stats.totalLatePayments;
        if (totalPayments == 0) return 0;
        
        // Calculate on-time ratio from global stats
        uint256 onTimeRatio = (stats.totalOnTimePayments * 100) / totalPayments;
        
        // Convert to score (0-50 points)
        reliabilityScore = (onTimeRatio * 50) / 100;
        if (reliabilityScore > 50) reliabilityScore = 50;
        
        // Apply penalty if too many series with few payments (gaming detection)
        if (stats.totalSeriesCreated > 0) {
            uint256 avgPaymentsPerSeries = totalPayments / stats.totalSeriesCreated;
            if (avgPaymentsPerSeries < 2) {
                reliabilityScore = reliabilityScore / 2;
            }
        }
        
        return reliabilityScore;
    }
    
    /**
     * @notice Calculate weighted delivery score
     * @dev Each series contributes proportionally to its promised revenue
     * @param protocol Protocol address
     * @return weightedScore Weighted delivery score (0-50)
     */
    function _calculateWeightedDeliveryScore(address protocol) internal view returns (uint256 weightedScore) {
        address[] memory series = protocolSeries[protocol];
        if (series.length == 0) return 0;
        
        uint256 totalPromised = 0;
        uint256 weightedSum = 0;
        
        // Calculate weighted sum: Σ(delivered_i / promised_i) * promised_i
        for (uint256 i = 0; i < series.length; i++) {
            SeriesRecord memory record = seriesRecords[series[i]];
            
            if (record.expectedRevenue > 0) {
                totalPromised += record.expectedRevenue;
                
                // Calculate delivery ratio for this series
                uint256 seriesRatio = (record.actualRevenue * 1e18) / record.expectedRevenue;
                if (seriesRatio > 1e18) seriesRatio = 1e18; // Cap at 100%
                
                // Weight by promised amount
                weightedSum += (seriesRatio * record.expectedRevenue) / 1e18;
            }
        }
        
        if (totalPromised == 0) return 0;
        
        // Final weighted score (0-50 points)
        weightedScore = (weightedSum * 50) / totalPromised;
        if (weightedScore > 50) weightedScore = 50;
        
        return weightedScore;
    }
    
    /**
     * @notice Get protocol statistics
     */
    function getProtocolStats(address protocol) external view returns (
        uint256 seriesCreated,
        uint256 revenuePromised,
        uint256 revenueDelivered,
        uint256 latePayments,
        uint256 onTimePayments,
        uint256 reputationScore,
        bool isBlacklisted
    ) {
        ProtocolStats memory stats = protocolStats[protocol];
        uint256 score = this.getReputationScore(protocol);
        
        return (
            stats.totalSeriesCreated,
            stats.totalRevenuePromised,
            stats.totalRevenueDelivered,
            stats.totalLatePayments,
            stats.totalOnTimePayments,
            score,
            stats.blacklisted
        );
    }
    
    /**
     * @notice Get series record
     */
    function getSeriesRecord(address series) external view returns (
        address protocol,
        uint256 expectedRevenue,
        uint256 actualRevenue,
        uint256 lastDistribution,
        uint256 distributionCount,
        uint256 expectedCadenceDays,
        bool active
    ) {
        SeriesRecord memory record = seriesRecords[series];
        return (
            record.protocol,
            record.expectedRevenue,
            record.actualRevenue,
            record.lastDistributionTime,
            record.distributionCount,
            record.expectedCadenceDays,
            record.active
        );
    }
    
    /**
     * @notice Get all series for a protocol
     */
    function getProtocolSeries(address protocol) external view returns (address[] memory) {
        return protocolSeries[protocol];
    }
    
    /**
     * @notice Blacklist a protocol (emergency only)
     */
    function blacklistProtocol(address protocol, string calldata reason) external onlyOwner {
        protocolStats[protocol].blacklisted = true;
        emit ProtocolBlacklisted(protocol, reason);
    }
    
    /**
     * @notice Report a protocol default (callable by authorized reporters like Series contracts)
     * @param protocol Protocol address that defaulted
     * @param reason Reason for default
     */
    function reportDefault(address protocol, string calldata reason) external {
        require(authorizedReporters[msg.sender], "Not authorized");
        protocolStats[protocol].blacklisted = true;
        emit ProtocolBlacklisted(protocol, reason);
    }
    
    /**
     * @notice Remove protocol from blacklist
     */
    function whitelistProtocol(address protocol) external onlyOwner {
        protocolStats[protocol].blacklisted = false;
        emit ProtocolWhitelisted(protocol);
    }
    
    /**
     * @notice Authorize a reporter (Factory, Router, Series)
     */
    function authorizeReporter(address reporter) external onlyOwner {
        require(reporter != address(0), "Invalid reporter");
        authorizedReporters[reporter] = true;
        emit ReporterAuthorized(reporter);
    }
    
    /**
     * @notice Revoke reporter authorization
     */
    function revokeReporter(address reporter) external onlyOwner {
        authorizedReporters[reporter] = false;
        emit ReporterRevoked(reporter);
    }
}
