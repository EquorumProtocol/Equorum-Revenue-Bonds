# Integration Guide for Protocols

> **Complete guide for protocols looking to raise capital using Equorum Revenue Bonds**

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Integration Steps](#integration-steps)
- [Bond Types](#bond-types)
- [Code Examples](#code-examples)
- [Best Practices](#best-practices)
- [Testing](#testing)
- [Support](#support)

---

## Overview

Equorum Revenue Bonds Protocol allows DeFi protocols to raise **non-dilutive capital** by selling future revenue streams as tradeable ERC-20 tokens.

### Why Use Revenue Bonds?

✅ **Non-dilutive** - No token emissions or governance dilution  
✅ **Flexible** - Choose revenue share % and duration  
✅ **Instant liquidity** - Bonds are tradeable ERC-20 tokens  
✅ **Trust-minimized** - Smart contract enforced terms  
✅ **Reputation-based** - Build credibility through consistent distributions

### Key Metrics

- **Deployed on:** Arbitrum One (Mainnet)
- **Total Value Locked:** Track on [equorumprotocol.org](https://equorumprotocol.org)
- **Active Series:** View all series on-chain
- **Audit Status:** Internal audits complete, external audit Q2 2026

---

## Quick Start

### Prerequisites

- Protocol deployed on Arbitrum One
- Consistent revenue stream (fees, royalties, etc.)
- Wallet with ETH for gas fees

### 5-Minute Integration

```solidity
// 1. Get the Factory address
address factory = 0x280E83c47E243267753B7E2f322f55c52d4D2C3a;

// 2. Create a revenue series
IRevenueSeriesFactory(factory).createSeries{value: creationFee}(
    "MyProtocol Revenue Bonds - 20% 12M",  // name
    "MYPROTO-RB-20-12M",                   // symbol
    msg.sender,                             // protocol address
    2000,                                   // 20% revenue share (in BPS)
    365,                                    // 12 months duration
    1_000_000 * 1e18,                      // 1M tokens supply
    0.01 ether                              // min distribution (anti-spam)
);

// 3. Distribute revenue to bondholders
revenueSeries.distributeRevenue{value: revenueAmount}();
```

That's it! Your protocol now has tradeable revenue bonds.

---

## Integration Steps

### Step 1: Choose Bond Type

Equorum offers two bond types:

| Type | Description | Best For |
|------|-------------|----------|
| **Soft Bonds** | Revenue-only, reputation-based | Established protocols with track record |
| **Guaranteed Bonds** | Revenue + Principal guarantee via escrow | New protocols or risk-averse investors |

### Step 2: Define Bond Terms

Choose your bond parameters:

```javascript
const bondTerms = {
    revenueShareBPS: 2000,        // 20% of protocol revenue
    durationDays: 365,            // 12 months
    totalSupply: 1_000_000 * 1e18, // 1M tokens
    minDistribution: 0.01 ether   // Minimum distribution amount
};
```

**Constraints:**
- Revenue Share: 0.01% - 50% (1 - 5000 BPS)
- Duration: 30 days - 5 years
- Supply: Minimum 1,000 tokens
- Min Distribution: > 0 (prevents griefing)

### Step 3: Create Series

**For Soft Bonds:**

```solidity
import "@equorum/contracts/v2/interfaces/IRevenueSeriesFactory.sol";

contract MyProtocol {
    IRevenueSeriesFactory public constant FACTORY = 
        IRevenueSeriesFactory(0x280E83c47E243267753B7E2f322f55c52d4D2C3a);
    
    address public revenueSeries;
    address public revenueRouter;
    
    function createRevenueBonds() external {
        // Create series (returns series + router addresses)
        (revenueSeries, revenueRouter) = FACTORY.createSeries{value: 0}(
            "MyProtocol Revenue Bonds - 20% 12M",
            "MYPROTO-RB-20-12M",
            address(this),      // protocol address
            2000,               // 20% revenue share
            365,                // 12 months
            1_000_000 * 1e18,   // 1M tokens
            0.01 ether          // min distribution
        );
        
        // Tokens are minted to protocol address
        // You can now sell/distribute them
    }
}
```

**For Guaranteed Bonds (with Escrow):**

```solidity
import "@equorum/contracts/v2/interfaces/IRevenueBondEscrowFactory.sol";

contract MyProtocol {
    IRevenueBondEscrowFactory public constant ESCROW_FACTORY = 
        IRevenueBondEscrowFactory(0x2CfE9a33050EB77fC124ec3eAac4fA4D687bE650);
    
    function createGuaranteedBonds() external payable {
        // Deposit principal to escrow
        uint256 principal = 100 ether;
        
        (address escrow, address series, address router) = 
            ESCROW_FACTORY.createEscrowBond{value: principal}(
                "MyProtocol Guaranteed Bonds - 20% 12M",
                "MYPROTO-GB-20-12M",
                address(this),
                2000,               // 20% revenue share
                365,                // 12 months
                1_000_000 * 1e18,   // 1M tokens
                0.01 ether,         // min distribution
                principal           // principal amount
            );
    }
}
```

### Step 4: Distribute Revenue

**Manual Distribution:**

```solidity
contract MyProtocol {
    address public revenueSeries;
    
    function distributeRevenue() external {
        // Calculate 20% of protocol revenue
        uint256 protocolRevenue = address(this).balance;
        uint256 bondholderShare = (protocolRevenue * 2000) / 10000; // 20%
        
        // Distribute to bondholders
        IRevenueSeries(revenueSeries).distributeRevenue{value: bondholderShare}();
    }
}
```

**Automated Distribution (Recommended):**

```solidity
contract MyProtocol {
    address public revenueRouter;
    
    // Call this whenever protocol receives fees
    receive() external payable {
        // Router automatically splits revenue
        // 20% to bondholders, 80% to protocol
        (bool success, ) = revenueRouter.call{value: msg.value}("");
        require(success, "Router distribution failed");
    }
}
```

### Step 5: Monitor & Maintain

**Check Series Status:**

```solidity
function getSeriesInfo() external view returns (
    uint256 totalRevenue,
    uint256 revenuePerToken,
    bool isActive,
    uint256 timeRemaining
) {
    return IRevenueSeries(revenueSeries).getSeriesInfo();
}
```

**Track Reputation:**

```solidity
function getProtocolReputation() external view returns (
    uint256 totalDistributed,
    uint256 distributionCount,
    uint256 avgDistribution,
    uint256 lastDistribution
) {
    address registry = 0xfe0A22D77fdf98cC556CBc2dC6B3749EBa4E89bA;
    return IProtocolReputationRegistry(registry).getProtocolStats(address(this));
}
```

---

## Bond Types

### Soft Bonds (Revenue-Only)

**Characteristics:**
- No principal guarantee
- Lower barrier to entry
- Reputation-based trust
- Best for established protocols

**Factory:** `0x280E83c47E243267753B7E2f322f55c52d4D2C3a`

**Use Case:**
```
Protocol: Camelot DEX
Revenue: Trading fees
Bond Terms: 20% of fees for 12 months
Supply: 1M tokens @ $0.10 = $100K raised
Investor Return: Pro-rata share of 20% of Camelot fees
```

### Guaranteed Bonds (Revenue + Escrow)

**Characteristics:**
- Principal locked in escrow
- Guaranteed return of principal at maturity
- Higher trust for new protocols
- Escrow contract holds funds

**Factory:** `0x2CfE9a33050EB77fC124ec3eAac4fA4D687bE650`

**Use Case:**
```
Protocol: New Lending Protocol
Revenue: Interest fees
Bond Terms: 15% of fees for 6 months
Principal: 50 ETH locked in escrow
Supply: 500K tokens @ $0.10 = $50K raised
Investor Return: Pro-rata fees + 50 ETH back at maturity
```

---

## Code Examples

### Example 1: Simple Integration

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@equorum/contracts/v2/interfaces/IRevenueSeriesFactory.sol";
import "@equorum/contracts/v2/interfaces/IRevenueSeries.sol";

contract SimpleProtocol {
    IRevenueSeriesFactory public constant FACTORY = 
        IRevenueSeriesFactory(0x280E83c47E243267753B7E2f322f55c52d4D2C3a);
    
    address public revenueSeries;
    address public revenueRouter;
    uint256 public constant BONDHOLDER_SHARE_BPS = 2000; // 20%
    
    event BondsCreated(address series, address router);
    event RevenueDistributed(uint256 amount);
    
    function createBonds() external {
        (revenueSeries, revenueRouter) = FACTORY.createSeries{value: 0}(
            "SimpleProtocol Revenue Bonds",
            "SIMPLE-RB",
            address(this),
            BONDHOLDER_SHARE_BPS,
            365,
            1_000_000 * 1e18,
            0.01 ether
        );
        
        emit BondsCreated(revenueSeries, revenueRouter);
    }
    
    function distributeRevenue() external {
        uint256 revenue = address(this).balance;
        uint256 bondholderAmount = (revenue * BONDHOLDER_SHARE_BPS) / 10000;
        
        IRevenueSeries(revenueSeries).distributeRevenue{value: bondholderAmount}();
        
        emit RevenueDistributed(bondholderAmount);
    }
    
    receive() external payable {}
}
```

### Example 2: Advanced Integration with Router

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@equorum/contracts/v2/interfaces/IRevenueSeriesFactory.sol";
import "@equorum/contracts/v2/interfaces/IRevenueRouter.sol";

contract AdvancedProtocol {
    IRevenueSeriesFactory public constant FACTORY = 
        IRevenueSeriesFactory(0x280E83c47E243267753B7E2f322f55c52d4D2C3a);
    
    address public revenueSeries;
    address public revenueRouter;
    
    event BondsCreated(address series, address router);
    event AutoDistribution(uint256 bondholderShare, uint256 protocolShare);
    
    function createBonds() external {
        (revenueSeries, revenueRouter) = FACTORY.createSeries{value: 0}(
            "AdvancedProtocol Revenue Bonds",
            "ADV-RB",
            address(this),
            2000, // 20%
            365,
            1_000_000 * 1e18,
            0.01 ether
        );
        
        emit BondsCreated(revenueSeries, revenueRouter);
    }
    
    // Automatic revenue distribution via router
    receive() external payable {
        // Router automatically splits:
        // - 20% to bondholders
        // - 80% back to protocol
        (bool success, ) = revenueRouter.call{value: msg.value}("");
        require(success, "Router failed");
        
        uint256 bondholderShare = (msg.value * 2000) / 10000;
        uint256 protocolShare = msg.value - bondholderShare;
        
        emit AutoDistribution(bondholderShare, protocolShare);
    }
}
```

### Example 3: Multi-Series Protocol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@equorum/contracts/v2/interfaces/IRevenueSeriesFactory.sol";

contract MultiSeriesProtocol {
    IRevenueSeriesFactory public constant FACTORY = 
        IRevenueSeriesFactory(0x280E83c47E243267753B7E2f322f55c52d4D2C3a);
    
    struct Series {
        address seriesAddress;
        address router;
        uint256 revenueShareBPS;
        bool active;
    }
    
    Series[] public series;
    
    event SeriesCreated(uint256 indexed seriesId, address series, address router);
    event RevenueDistributed(uint256 indexed seriesId, uint256 amount);
    
    function createNewSeries(
        string memory name,
        string memory symbol,
        uint256 revenueShareBPS,
        uint256 durationDays,
        uint256 totalSupply
    ) external returns (uint256 seriesId) {
        (address seriesAddr, address router) = FACTORY.createSeries{value: 0}(
            name,
            symbol,
            address(this),
            revenueShareBPS,
            durationDays,
            totalSupply,
            0.01 ether
        );
        
        seriesId = series.length;
        series.push(Series({
            seriesAddress: seriesAddr,
            router: router,
            revenueShareBPS: revenueShareBPS,
            active: true
        }));
        
        emit SeriesCreated(seriesId, seriesAddr, router);
    }
    
    function distributeToAllSeries() external {
        uint256 totalRevenue = address(this).balance;
        
        for (uint256 i = 0; i < series.length; i++) {
            if (!series[i].active) continue;
            
            uint256 share = (totalRevenue * series[i].revenueShareBPS) / 10000;
            
            IRevenueSeries(series[i].seriesAddress).distributeRevenue{value: share}();
            
            emit RevenueDistributed(i, share);
        }
    }
    
    receive() external payable {}
}
```

---

## Best Practices

### 1. Revenue Distribution Frequency

**Recommended:** Weekly or bi-weekly distributions

```solidity
uint256 public lastDistribution;
uint256 public constant DISTRIBUTION_INTERVAL = 7 days;

function shouldDistribute() public view returns (bool) {
    return block.timestamp >= lastDistribution + DISTRIBUTION_INTERVAL;
}

function distributeRevenue() external {
    require(shouldDistribute(), "Too soon");
    
    uint256 bondholderShare = calculateBondholderShare();
    revenueSeries.distributeRevenue{value: bondholderShare}();
    
    lastDistribution = block.timestamp;
}
```

### 2. Minimum Distribution Amount

Set appropriate minimum to prevent dust distributions:

```solidity
uint256 public constant MIN_DISTRIBUTION = 0.1 ether;

function distributeRevenue() external {
    uint256 amount = calculateBondholderShare();
    require(amount >= MIN_DISTRIBUTION, "Amount too small");
    
    revenueSeries.distributeRevenue{value: amount}();
}
```

### 3. Emergency Pause

Implement pause mechanism for emergencies:

```solidity
bool public distributionPaused;

function pauseDistributions() external onlyOwner {
    distributionPaused = true;
}

function distributeRevenue() external {
    require(!distributionPaused, "Paused");
    // ... distribution logic
}
```

### 4. Transparency

Emit events for all distributions:

```solidity
event RevenueDistributed(
    uint256 indexed timestamp,
    uint256 totalRevenue,
    uint256 bondholderShare,
    uint256 protocolShare
);

function distributeRevenue() external {
    uint256 total = address(this).balance;
    uint256 bondholderShare = (total * revenueShareBPS) / 10000;
    uint256 protocolShare = total - bondholderShare;
    
    revenueSeries.distributeRevenue{value: bondholderShare}();
    
    emit RevenueDistributed(block.timestamp, total, bondholderShare, protocolShare);
}
```

### 5. Build Reputation

Consistent distributions build trust:

```solidity
// Track your distribution history
function getReputationScore() external view returns (uint256) {
    address registry = 0xfe0A22D77fdf98cC556CBc2dC6B3749EBa4E89bA;
    (uint256 totalDist, uint256 count,,) = 
        IProtocolReputationRegistry(registry).getProtocolStats(address(this));
    
    return count > 0 ? totalDist / count : 0; // Average distribution
}
```

---

## Testing

### Testnet Deployment

Test your integration on **Arbitrum Sepolia** first:

```javascript
// Arbitrum Sepolia addresses
const TESTNET_FACTORY = "0x2B2b7DC0b8276b74dEb57bB30b7AA66697DF7dA8";

// Create test series
await factory.createSeries(
    "Test Revenue Bonds",
    "TEST-RB",
    protocolAddress,
    2000,
    30, // 30 days for testing
    1000 * 1e18,
    0.001 ether
);
```

### Test Checklist

- [ ] Create series successfully
- [ ] Distribute revenue multiple times
- [ ] Verify bondholder claims work
- [ ] Test with multiple bondholders
- [ ] Verify series maturity behavior
- [ ] Check reputation registry updates
- [ ] Test edge cases (zero revenue, dust amounts)

### Hardhat Testing

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Revenue Bonds Integration", function() {
    it("Should create series and distribute revenue", async function() {
        const [protocol, investor] = await ethers.getSigners();
        
        // Deploy your protocol
        const MyProtocol = await ethers.getContractFactory("MyProtocol");
        const myProtocol = await MyProtocol.deploy();
        
        // Create bonds
        await myProtocol.createBonds();
        const seriesAddr = await myProtocol.revenueSeries();
        
        // Get series contract
        const series = await ethers.getContractAt("RevenueSeries", seriesAddr);
        
        // Transfer some bonds to investor
        await series.connect(protocol).transfer(investor.address, ethers.parseEther("1000"));
        
        // Distribute revenue
        await myProtocol.distributeRevenue({ value: ethers.parseEther("1") });
        
        // Investor should have claimable revenue
        const earned = await series.earned(investor.address);
        expect(earned).to.be.gt(0);
    });
});
```

---

## Support

### Resources

- **Website:** [equorumprotocol.org](https://equorumprotocol.org)
- **Documentation:** [docs.equorumprotocol.org](https://docs.equorumprotocol.org)
- **GitHub:** [github.com/EquorumProtocol](https://github.com/EquorumProtocol)
- **Whitepaper:** [View PDF](./WHITEPAPER.pdf)

### Community

- **Discord:** [Join our Discord](#)
- **Twitter:** [@EquorumProtocol](#)
- **Telegram:** [t.me/equorum](#)

### Technical Support

- **GitHub Issues:** [Report bugs or request features](https://github.com/EquorumProtocol/Equorum-Revenue-Bonds/issues)
- **Email:** dev@equorumprotocol.org
- **Developer Chat:** Join our Discord #dev-support channel

### Contract Addresses

**Arbitrum One (Mainnet):**
- RevenueSeriesFactory: `0x280E83c47E243267753B7E2f322f55c52d4D2C3a`
- RevenueBondEscrowFactory: `0x2CfE9a33050EB77fC124ec3eAac4fA4D687bE650`
- ProtocolReputationRegistry: `0xfe0A22D77fdf98cC556CBc2dC6B3749EBa4E89bA`

**Arbitrum Sepolia (Testnet):**
- RevenueSeriesFactory: `0x2B2b7DC0b8276b74dEb57bB30b7AA66697DF7dA8`

---

## FAQ

**Q: What's the minimum revenue share I can offer?**  
A: 0.01% (1 BPS), but we recommend at least 5-10% to attract investors.

**Q: Can I create multiple series?**  
A: Yes! You can create as many series as needed with different terms.

**Q: What happens if I miss a distribution?**  
A: Nothing breaks, but your reputation score will be affected. Investors prefer consistent distributions.

**Q: Can I buy back bonds early?**  
A: Yes, bonds are ERC-20 tokens. You can buy them on secondary markets.

**Q: What are the fees?**  
A: Currently no fees (feePolicy = address(0)). Future fee policy may be implemented via governance.

**Q: Is there a minimum protocol TVL requirement?**  
A: No hard requirement, but investors will evaluate your protocol's fundamentals.

---

**Ready to integrate? Start on [Arbitrum Sepolia testnet](https://sepolia.arbiscan.io) today!**
