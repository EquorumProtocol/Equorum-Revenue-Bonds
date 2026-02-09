# ProtocolReputationRegistry.sol

## Overview

`ProtocolReputationRegistry` is an on-chain reputation system for Revenue Bond protocols. It tracks payment history, punctuality, and compliance across all bond series created by a protocol.

## Deployed Address

| Network | Address |
|---------|---------|
| Arbitrum One | `0xfe0A22D77fdf98cC556CBc2dC6B3749EBa4E89bA` |
| Arbitrum Sepolia | `0xE6cBDa1dBAb26d6740d5D0158EF4b0114fcb525F` |

## Important Limitations

- Measures **payment compliance**, not revenue truth
- Tracks "did they pay what they promised" not "did they earn what they claimed"
- Protocols can game this by promising less or paying dust amounts
- Score is a **heuristic**, not absolute truth
- Use case: trust-minimized capital raising, not trustless DeFi

## How It Works

### Data Tracked Per Protocol

```solidity
struct ProtocolStats {
    uint256 totalSeriesCreated;      // Number of bond series issued
    uint256 totalRevenuePromised;    // Total ETH promised across all series
    uint256 totalRevenueDelivered;   // Total ETH actually distributed
    uint256 totalLatePayments;       // Number of missed/late distributions
    uint256 totalOnTimePayments;     // Number of on-time distributions
    uint256 lastPaymentTimestamp;    // Last time protocol distributed revenue
    bool blacklisted;                // Emergency blacklist flag
}
```

### Data Tracked Per Series

```solidity
struct SeriesRecord {
    address seriesAddress;
    address protocol;
    uint256 expectedRevenue;         // Expected revenue based on protocol metrics
    uint256 actualRevenue;           // Actual revenue distributed
    uint256 lastDistributionTime;
    uint256 distributionCount;
    uint256 expectedCadenceDays;     // Expected payment frequency
    uint256 lastLateRecorded;        // Prevents late payment spam
    bool active;
}
```

### Reputation Score

The registry provides raw data. Score calculation is done off-chain or by consumer contracts:

```
deliveryRatio = totalRevenueDelivered / totalRevenuePromised
punctualityScore = totalOnTimePayments / (totalOnTimePayments + totalLatePayments)
```

Scores are **public and permanent** — protocols cannot hide bad behavior.

## Authorized Reporters

Only authorized contracts can write to the registry:

| Reporter | What it reports |
|----------|----------------|
| RevenueSeriesFactory | Series creation, initial registration |
| RevenueBondEscrowFactory | Escrow series creation, initial registration |
| RevenueSeries contracts | Revenue distributions, late payments |
| RevenueBondEscrow contracts | Revenue distributions, late payments |

The factories authorize each new series contract as a reporter during creation.

## Functions

### Reporter Functions (Authorized Only)

| Function | Description |
|----------|-------------|
| `registerSeries(protocol, series, expectedRevenue, cadenceDays)` | Register a new series |
| `reportDistribution(protocol, series, amount)` | Report a revenue distribution |
| `reportLatePayment(protocol, series)` | Report a missed/late payment |
| `authorizeReporter(addr)` | Authorize a new reporter |

### Owner Functions (Safe Multisig)

| Function | Description |
|----------|-------------|
| `authorizeReporter(addr)` | Authorize a reporter |
| `revokeReporter(addr)` | Revoke a reporter |
| `blacklistProtocol(addr)` | Emergency blacklist |
| `unblacklistProtocol(addr)` | Remove blacklist |

### View Functions (Public)

| Function | Description |
|----------|-------------|
| `protocolStats(addr)` | Get protocol's full stats |
| `seriesRecords(addr)` | Get series record |
| `protocolSeries(addr, index)` | Get protocol's series by index |
| `authorizedReporters(addr)` | Check if address is authorized |
| `getProtocolScore(addr)` | Get computed reputation score |

## Events

```solidity
event SeriesRegistered(address indexed protocol, address indexed series, uint256 expectedRevenue);
event RevenueDistributed(address indexed protocol, address indexed series, uint256 amount, uint256 timestamp);
event LatePaymentRecorded(address indexed protocol, address indexed series, uint256 timestamp);
event ProtocolBlacklisted(address indexed protocol);
event ProtocolUnblacklisted(address indexed protocol);
event ReporterAuthorized(address indexed reporter);
event ReporterRevoked(address indexed reporter);
```

## Integration

### Reading Reputation (for frontends/dApps)

```javascript
const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);

// Get protocol stats
const stats = await registry.protocolStats(protocolAddress);
console.log("Series created:", stats.totalSeriesCreated);
console.log("Revenue delivered:", ethers.formatEther(stats.totalRevenueDelivered));
console.log("On-time payments:", stats.totalOnTimePayments);
console.log("Late payments:", stats.totalLatePayments);
console.log("Blacklisted:", stats.blacklisted);
```

### Expected Cadence

The registry calculates expected payment frequency based on bond duration:

| Duration | Expected Cadence |
|----------|-----------------|
| > 180 days | 30 days (monthly) |
| <= 180 days | 7 days (weekly) |

Late payments are recorded when a distribution is overdue by more than the expected cadence.
