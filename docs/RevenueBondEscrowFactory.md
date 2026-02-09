# RevenueBondEscrowFactory.sol

## Overview

`RevenueBondEscrowFactory` creates **Guaranteed Revenue Bond** series. Each call to `createEscrowSeries()` deploys a new `RevenueBondEscrow` (ERC-20 bond token) and a `RevenueRouter` (revenue splitter), linked together.

## Deployed Address

| Network | Address |
|---------|---------|
| Arbitrum One | `0x2CfE9a33050EB77fC124ec3eAac4fA4D687bE650` |
| Arbitrum Sepolia | `0x1e88fC591c2E5cA12C713f7C4BE39f2b14D202cB` |

## Architecture

The factory uses the **Deployer Pattern** to stay under the 24KB contract size limit:

```
RevenueBondEscrowFactory
    │
    ├── EscrowDeployer.sol  (deploys RevenueBondEscrow)
    │       └── RevenueBondEscrow.sol (14KB+ creation code)
    │
    └── RouterDeployer.sol  (deploys RevenueRouter)
            └── RevenueRouter.sol (6KB+ creation code)
```

The factory calls `EscrowDeployer.deploy()` and `RouterDeployer.deploy()` instead of importing the contracts directly. Both deployers are owned by the factory — only the factory can create new instances.

## Constructor

```solidity
constructor(
    address _treasury,           // Fee receiver (Safe multisig)
    address _reputationRegistry, // ProtocolReputationRegistry address
    address _escrowDeployer,     // EscrowDeployer contract
    address _routerDeployer      // RouterDeployer contract
)
```

## Creating a Series

```solidity
function createEscrowSeries(
    string memory name,
    string memory symbol,
    address protocol,              // Must be msg.sender
    uint256 revenueShareBPS,       // 1-5000 (0.01% - 50%)
    uint256 durationDays,          // 30-1825 days
    uint256 totalSupply,           // Min 1000e18 tokens
    uint256 principalAmount,       // ETH to be escrowed (> 0)
    uint256 minDistributionAmount, // Min 0.001 ETH
    uint256 depositDeadlineDays    // 1-90 days
) external payable returns (address seriesAddress, address routerAddress)
```

### What happens on createEscrowSeries():

1. Validates all parameters (via EscrowValidation library)
2. Checks safety policy (if set)
3. Checks access policy (if set)
4. Collects fee (if fee policy set)
5. Deploys RevenueRouter via RouterDeployer
6. Deploys RevenueBondEscrow via EscrowDeployer
7. Links router to escrow series
8. Registers series in ProtocolReputationRegistry
9. Transfers ownership of both contracts to protocol
10. Emits `EscrowSeriesCreated` event

### After creation, the protocol must:

1. Call `escrow.depositPrincipal{value: principalAmount}()` to activate
2. Call `escrow.startSale(price, treasury)` to sell tokens
3. Send revenue to the router address

## Safety Limits (Hardcoded)

| Parameter | Min | Max |
|-----------|-----|-----|
| Revenue Share | 1 BPS (0.01%) | 5000 BPS (50%) |
| Duration | 30 days | 1825 days (5 years) |
| Total Supply | 1,000 tokens | No max |
| Principal Amount | > 0 | No max |
| Min Distribution | 0.001 ETH | No max |
| Deposit Deadline | 1 day | 90 days |

These limits are hardcoded in `EscrowValidation.sol` and cannot be changed by the owner or policies. Policies can only restrict further.

## Pluggable Policies

| Policy | Interface | Purpose |
|--------|-----------|---------|
| **Fee Policy** | `IFeePolicy` | Calculate creation fees |
| **Safety Policy** | `ISafetyPolicy` | Additional parameter validation |
| **Access Policy** | `IAccessPolicy` | Whitelist/blacklist creators |

All policies are optional (address(0) = disabled). Currently all disabled on mainnet.

## Admin Functions (Owner = Safe)

| Function | Description |
|----------|-------------|
| `setTreasury(addr)` | Update fee receiver |
| `setReputationRegistry(addr)` | Update registry |
| `setFeePolicy(addr)` | Set/remove fee policy |
| `setSafetyPolicy(addr)` | Set/remove safety policy |
| `setAccessPolicy(addr)` | Set/remove access policy |
| `pause()` | Pause series creation |
| `unpause()` | Resume series creation |

## View Functions

| Function | Returns |
|----------|---------|
| `totalSeries()` | Number of series created |
| `seriesCount(protocol)` | Series created by a protocol |
| `allSeries(index)` | Series address by index |
| `seriesByProtocol(protocol, index)` | Protocol's series by index |
| `routerBySeries(series)` | Router address for a series |
| `limits()` | (maxShareBPS, minDurationDays, maxDurationDays, minTotalSupply) |

## Events

```solidity
event EscrowSeriesCreated(
    address indexed series,
    address indexed router,
    address indexed protocol,
    uint256 revenueShareBPS,
    uint256 durationDays,
    uint256 totalSupply,
    uint256 principalAmount
);
event FeeCollected(address indexed payer, address indexed receiver, uint256 amount, uint8 feeType);
event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
event ReputationRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
event FeePolicyUpdated(address indexed oldPolicy, address indexed newPolicy);
event SafetyPolicyUpdated(address indexed oldPolicy, address indexed newPolicy);
event AccessPolicyUpdated(address indexed oldPolicy, address indexed newPolicy);
event ReputationRegistrationFailed(address indexed protocol, address indexed series);
event Paused(address account);
event Unpaused(address account);
```

## Comparison with RevenueSeriesFactory

| Feature | RevenueSeriesFactory | RevenueBondEscrowFactory |
|---------|---------------------|-------------------------|
| Bond Type | Soft (revenue only) | Guaranteed (revenue + principal) |
| Tokens minted | At creation (to protocol) | After depositPrincipal() |
| Principal | None | Locked in escrow |
| Sale mechanism | Off-chain / DEX | Built-in buyTokens() |
| Deployer pattern | No (direct deploy) | Yes (EscrowDeployer + RouterDeployer) |
| State machine | Active → Matured | PendingPrincipal → Active → Matured/Defaulted |
