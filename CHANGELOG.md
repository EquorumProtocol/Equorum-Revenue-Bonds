# Changelog

All notable changes to the Equorum Protocol will be documented in this file.

## [v2.0.0] - 2026-01-28 (Pending Deployment)

### 🎯 Major Changes

**New Architecture: Dual Bond Model**
- Introduced **Soft Bonds** (revenue-only, no principal guarantee)
- Introduced **Hybrid Bonds** (revenue + principal guarantee via escrow)
- Protocols can now choose the model that fits their needs

### ✨ New Features

**RevenueBondEscrow.sol** (NEW)
- Escrow contract for Hybrid Bonds
- Principal held in smart contract until maturity
- Automatic maturity detection
- Double-claim protection
- Dust principal rescue function
- Deposit deadline to prevent unfair defaults

**ProtocolReputationRegistry.sol** (NEW)
- On-chain reputation tracking for protocols
- Gaming-resistant scoring system
- Normalized by series count
- Tracks payment punctuality and volume
- Blacklist mechanism for bad actors

### 🔧 Critical Fixes

**Security Improvements:**
1. **Double Claim Protection** - Users cannot claim principal twice
2. **Dust Rescue Safety** - Only rescues principal dust, not revenue
3. **Overflow Protection** - Smart overflow checks prevent DoS
4. **Rounding Validation** - Prevents revenue loss from rounding to zero
5. **ETH Stuck Prevention** - Proper handling of failed routing attempts

**RevenueSeries.sol Updates:**
- Auto-maturity on revenue distribution
- Overflow protection in reward calculations
- Minimum claim amount (1000 wei) to prevent dust claims
- Rounding validation on distributions

**RevenueRouter.sol Updates:**
- `pendingToRoute` variable to track pending distributions
- Proper cleanup on series maturity
- Rounding that favors bondholders
- Protection against premature protocol withdrawals

**RevenueSeriesFactory.sol Updates:**
- Minimum distribution amount validation (0.001 ETH)
- Support for both Soft and Hybrid bond creation

**ProtocolReputationRegistry.sol:**
- Normalized scoring to prevent gaming via many small series
- Division by zero protection
- Spam prevention mechanisms

### 📊 Audit Results

**First Audit (Internal):**
- 12 inconsistencies identified
- 7 critical fixes implemented
- 3 already protected
- 2 documented as limitations

**Second Audit (Internal):**
- 10 inconsistencies identified
- 5 critical fixes implemented
- 2 already protected
- 3 documented as limitations

**Total:** 22 issues identified and addressed

### 🔄 Breaking Changes

- Factory now requires `bondType` parameter (0 = Soft, 1 = Hybrid)
- Hybrid bonds require `principalAmount` parameter
- New `depositDeadline` parameter for Hybrid bonds

### 📝 Documentation

- Added comparative analysis vs Maple/Goldfinch/Centrifuge/Pendle/GMX
- Updated positioning: "Non-Dilutive Financing for DeFi Protocols"
- New whitepaper sections on dual bond model

---

## [v1.0.0] - 2026-01-12 (Deployed to Arbitrum Mainnet)

### 🚀 Initial Release

**Deployed Contracts:**
- RevenueSeriesFactory: `0x8afA0318363FfBc29Cc28B3C98d9139C08Af737b`
- Treasury/Owner: `0xBa69aEd75E8562f9D23064aEBb21683202c5279B` (Safe Multisig)

**Features:**
- Basic revenue distribution system
- ERC20 bond tokens
- Revenue sharing via Router
- Factory for creating series
- Synthetix-style reward distribution

**Configuration:**
- Network: Arbitrum One (ChainId: 42161)
- Fees: Disabled (0 ETH)
- Max Revenue Share: 50%
- Min Duration: 30 days
- Max Duration: 5 years (1825 days)

### 📈 Stats

- Gas Used: 4,162,266
- Deploy Transaction: `0x23d97dfb48f39b5605802ba4255d674a5127dbe5430c1cbea7cbc7365993c1d8`

---

## Legend

- 🎯 Major Changes
- ✨ New Features
- 🔧 Fixes
- 🔄 Breaking Changes
- 📝 Documentation
- 🚀 Deployment
- 📊 Audit
- 📈 Stats
