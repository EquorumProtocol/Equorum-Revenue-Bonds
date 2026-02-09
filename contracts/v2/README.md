# Revenue Bonds V2 - Smart Contracts

**Status:** Live on Arbitrum One  
**Version:** 2.0.0  
**Solidity:** 0.8.24  

---

## Deployed Addresses (Arbitrum One)

| Contract | Address |
|----------|---------|
| RevenueSeriesFactory | `0x280E83c47E243267753B7E2f322f55c52d4D2C3a` |
| RevenueBondEscrowFactory | `0x2CfE9a33050EB77fC124ec3eAac4fA4D687bE650` |
| ProtocolReputationRegistry | `0xfe0A22D77fdf98cC556CBc2dC6B3749EBa4E89bA` |
| EscrowDeployer | `0x989BCB780EEE189Bc85e04505e59Fd2Fb3CAA843` |
| RouterDeployer | `0x7c80F6312BFD762B958Ccf9DF2E397840c7856d3` |
| Owner/Treasury (Safe) | `0xBa69aEd75E8562f9D23064aEBb21683202c5279B` |

---

## Contracts

### Core (`core/`)

**RevenueSeries.sol** - Soft Bond (ERC-20)
- Protocol creates series, receives all tokens
- Revenue distributed via Synthetix reward-per-token pattern
- Investors hold tokens and claim proportional revenue
- Auto-maturity after duration expires

**RevenueRouter.sol** - Revenue Routing
- Receives ETH, splits by revenueShareBPS
- Series share goes to RevenueSeries (distributeRevenue)
- Protocol share returned to protocol address
- Graceful failure handling (failedRouteCount)

**RevenueSeriesFactory.sol** - Soft Bond Factory
- Creates RevenueSeries + RevenueRouter pairs
- Pluggable policies: IFeePolicy, ISafetyPolicy, IAccessPolicy
- Hardcoded safety limits (max 50% share, 30-1825 days, min 1000 tokens)
- Registers series in ProtocolReputationRegistry

**RevenueBondEscrow.sol** - Guaranteed Bond (ERC-20)
- State machine: PendingPrincipal -> Active -> Matured/Defaulted
- Protocol deposits principal (locked in contract)
- Tokens minted to protocol after deposit
- Built-in sale mechanism (startSale, buyTokens, stopSale)
- Revenue distribution (same Synthetix pattern)
- Principal claimable at maturity

**RevenueBondEscrowFactory.sol** - Guaranteed Bond Factory
- Creates RevenueBondEscrow + RevenueRouter via deployer contracts
- Same pluggable policies as RevenueSeriesFactory
- Uses EscrowDeployer + RouterDeployer (size optimization)

**EscrowDeployer.sol** / **RouterDeployer.sol** - Deployer Pattern
- Separate contracts that hold creation code
- Keeps EscrowFactory under 24KB contract size limit
- Owned by EscrowFactory (only factory can deploy)

### Registry (`registry/`)

**ProtocolReputationRegistry.sol** - On-chain Reputation
- Tracks payment history, punctuality, compliance
- Authorized reporters: both factories
- Public, permanent, immutable scores
- Measures payment compliance (not revenue truth)

### Interfaces (`interfaces/`)

- **IFeePolicy** - `getFeeQuote(protocol, bps, days, supply, minDist) -> (fee, receiver)`
- **ISafetyPolicy** - `validateParams(protocol, bps, days, supply, minDist)` (can only restrict further)
- **IAccessPolicy** - `canCreate(sender) -> bool`
- **IProtocolReputationRegistry** - Registry interface

### Libraries (`libraries/`)

- **EscrowValidation** - Shared validation for escrow params, fee handling, cadence calculation

---

## Security

**22 issues fixed** across 2 internal audit rounds:
- 12 Critical (reentrancy, overflow, access control)
- 7 Medium (edge cases, gas optimization)
- 3 Low (documentation, naming)

Key protections:
- ReentrancyGuard on all state-changing functions
- Solidity 0.8.24 overflow protection
- Synthetix pattern prevents double-claim
- Interface validation on policy contracts
- Hardcoded safety limits (cannot be bypassed by policies)

See [../../audits/](../../audits/) for full reports.

---

## Lifecycle

### Soft Bond
```
createSeries() -> [tokens minted to protocol] -> protocol distributes tokens
                -> router.receiveAndRoute() -> series.distributeRevenue()
                -> investor.claimRevenue()
                -> [maturity] -> series.matureSeries()
```

### Guaranteed Bond
```
createEscrowSeries() -> [state: PendingPrincipal]
                      -> escrow.depositPrincipal() -> [state: Active, tokens minted]
                      -> escrow.startSale() -> investor.buyTokens()
                      -> router.receiveAndRoute() -> escrow.distributeRevenue()
                      -> investor.claimRevenue()
                      -> [maturity] -> investor.claimPrincipal()
```

---

**V1 contracts remain on mainnet but are deprecated. V2 is a new deployment, not an upgrade.**
