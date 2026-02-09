# Migration Guide: v1 → v2

This guide explains the differences between v1 and v2 of the Equorum Protocol and how to migrate.

---

## Overview

**v1:** Single bond model (revenue-only, no principal guarantee)  
**v2:** Dual bond model (Soft Bonds + Hybrid Bonds with escrow)

---

## Key Differences

### Architecture

| Feature | v1 | v2 |
|---------|----|----|
| Bond Types | 1 (Revenue-only) | 2 (Soft + Hybrid) |
| Principal Guarantee | ❌ No | ✅ Yes (Hybrid only) |
| Escrow Contract | ❌ No | ✅ Yes (Hybrid) |
| Reputation System | ❌ No | ✅ Yes |
| Auto-Maturity | ❌ No | ✅ Yes |
| Overflow Protection | ❌ No | ✅ Yes |
| Double Claim Protection | ❌ No | ✅ Yes |

---

## Contract Changes

### 1. RevenueSeriesFactory

**v1:**
```solidity
function createSeries(
    string memory name,
    string memory symbol,
    uint256 revenueShareBPS,
    uint256 durationDays,
    uint256 totalSupply,
    uint256 minDistributionAmount
) external payable returns (address, address)
```

**v2:**
```solidity
function createSeries(
    string memory name,
    string memory symbol,
    uint256 revenueShareBPS,
    uint256 durationDays,
    uint256 totalSupply,
    uint256 minDistributionAmount,
    BondType bondType,              // NEW: 0 = Soft, 1 = Hybrid
    uint256 principalAmount,        // NEW: Required for Hybrid
    uint256 depositDeadline         // NEW: Required for Hybrid
) external payable returns (address, address)
```

**Migration:**
- Add `bondType` parameter (0 for Soft, 1 for Hybrid)
- Add `principalAmount` (0 for Soft, actual amount for Hybrid)
- Add `depositDeadline` (0 for Soft, timestamp for Hybrid)

---

### 2. RevenueSeries (Soft Bond)

**Changes:**
- ✅ Auto-maturity on `distributeRevenue()`
- ✅ Overflow protection in `_updateRewards()`
- ✅ Minimum claim amount (1000 wei)
- ✅ Rounding validation

**No breaking changes to external API**

---

### 3. RevenueBondEscrow (NEW - Hybrid Bond)

**New contract for Hybrid Bonds:**
- Holds principal in escrow
- Distributes revenue like RevenueSeries
- Allows principal claim after maturity
- Prevents double claims
- Auto-matures when past maturity date

**Key Functions:**
```solidity
depositPrincipal() payable          // Protocol deposits principal
distributeRevenue() payable         // Distribute revenue
claimPrincipal()                    // Claim principal after maturity
claimRevenue()                      // Claim revenue anytime
declareDefault()                    // If principal not deposited
rescueDustPrincipal()              // Rescue dust after all claims
```

---

### 4. RevenueRouter

**Changes:**
- ✅ `pendingToRoute` variable to track pending distributions
- ✅ Proper cleanup on series maturity
- ✅ Rounding that favors bondholders
- ✅ Protection against premature withdrawals

**No breaking changes to external API**

---

### 5. ProtocolReputationRegistry (NEW)

**New contract for reputation tracking:**
- Tracks payment history
- Calculates reputation scores
- Gaming-resistant (normalized by series count)
- Blacklist mechanism

**Key Functions:**
```solidity
registerSeries(address protocol, ...)      // Register new series
recordDistribution(address protocol, ...)  // Record payment
getReputationScore(address protocol)       // Get score (0-100)
```

---

## Migration Steps

### For Existing v1 Users

**Option 1: Keep Using v1**
- v1 contracts remain on mainnet
- Continue working as before
- No action required

**Option 2: Migrate to v2**
1. Create new series using v2 Factory
2. Choose bond type (Soft or Hybrid)
3. If Hybrid, deposit principal
4. Distribute tokens to holders
5. Old v1 series continue until maturity

**Note:** Cannot upgrade existing v1 series to v2. Must create new series.

---

### For Protocol Integrators

**Update Integration Code:**

```javascript
// v1
const tx = await factory.createSeries(
    "Series Name",
    "SYMBOL",
    2000,        // 20% revenue share
    365,         // 365 days
    1000000,     // 1M tokens
    ethers.utils.parseEther("0.001")
);

// v2 - Soft Bond (same as v1)
const tx = await factory.createSeries(
    "Series Name",
    "SYMBOL",
    2000,
    365,
    1000000,
    ethers.utils.parseEther("0.001"),
    0,           // BondType.Soft
    0,           // No principal
    0            // No deadline
);

// v2 - Hybrid Bond (new)
const tx = await factory.createSeries(
    "Series Name",
    "SYMBOL",
    2000,
    365,
    1000000,
    ethers.utils.parseEther("0.001"),
    1,           // BondType.Hybrid
    ethers.utils.parseEther("500"),  // 500 ETH principal
    Math.floor(Date.now() / 1000) + 86400 * 7  // 7 days to deposit
);
```

---

## Deployment Addresses

### v1 (Arbitrum Mainnet)
```
Factory: 0x8afA0318363FfBc29Cc28B3C98d9139C08Af737b
Treasury: 0xBa69aEd75E8562f9D23064aEBb21683202c5279B
```

### v2 (Pending Deployment)
```
TBD - Will be updated after deployment
```

---

## Testing

**v1 Testnet (Arbitrum Sepolia):**
```
Factory: 0x2B2b7DC0b8276b74dEb57bB30b7AA66697DF7dA8
Demo Series: 0xb42751FFBCFbe76dd5Fc919088B2a81B52C48D19
Demo Router: 0x3D170736435F9D2e3eC7164dA56EC1DE0dd24A5F
```

**v2 Testnet:**
```
TBD - Deploy to testnet first
```

---

## FAQ

**Q: Can I upgrade my v1 series to v2?**  
A: No. v1 series are immutable. Create a new v2 series instead.

**Q: Will v1 stop working?**  
A: No. v1 contracts remain on mainnet and will work forever.

**Q: Should I use Soft or Hybrid bonds?**  
A: 
- **Soft:** Lower risk for protocol, higher yield for investors
- **Hybrid:** Higher trust, principal guarantee, better for established protocols

**Q: What happens to v1 reputation?**  
A: v2 has a new reputation system. v1 history won't transfer automatically.

**Q: Can I create both Soft and Hybrid bonds?**  
A: Yes! Use the same Factory, just specify different `bondType`.

---

## Support

For questions or issues:
- GitHub Issues: [Equorum-Protocol/issues](https://github.com/your-org/Equorum-Protocol/issues)
- Discord: [Join our Discord](#)
- Twitter: [@EquorumProtocol](#)
