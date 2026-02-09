# RevenueBondEscrow.sol

## Overview

`RevenueBondEscrow` is an ERC-20 token contract that represents a **Guaranteed Revenue Bond**. It combines revenue sharing with principal protection — the protocol deposits ETH upfront (locked in escrow), and investors get their principal back at maturity plus any revenue earned during the bond's lifetime.

## Key Features

- **Principal Guarantee**: Protocol deposits ETH that is locked until maturity
- **Built-in Sale**: Protocol can sell tokens directly to investors via `buyTokens()`
- **Revenue Distribution**: Same Synthetix reward-per-token pattern as RevenueSeries
- **State Machine**: PendingPrincipal → Active → Matured/Defaulted
- **ERC-20 Tradeable**: Tokens are fully transferable on secondary markets
- **Deposit Deadline**: Protocol must deposit principal within a deadline or series can be defaulted

## State Machine

```
                    depositPrincipal()
PendingPrincipal ──────────────────────> Active
       │                                    │
       │ (deadline passed)                  │ (maturityDate reached)
       │                                    │
       └──> Defaulted                       └──> Matured
```

### States

| State | Description |
|-------|-------------|
| **PendingPrincipal** | Initial state. Waiting for protocol to deposit principal. No tokens minted. |
| **Active** | Principal deposited. Tokens minted to protocol. Sale and revenue distribution enabled. |
| **Matured** | Bond expired. Investors can claim principal + remaining revenue. |
| **Defaulted** | Protocol failed to deposit principal before deadline. |

## Immutable Terms

```solidity
address public immutable protocol;           // Protocol that created the bond
address public immutable router;             // Revenue router address
address public immutable reputationRegistry; // Reputation tracking
uint256 public immutable revenueShareBPS;    // Revenue share (e.g., 2000 = 20%)
uint256 public immutable maturityDate;       // When bond expires
uint256 public immutable totalTokenSupply;   // Max token supply
uint256 public immutable principalAmount;    // ETH to be escrowed
uint256 public immutable minPurchaseAmount;  // Min tokens per purchase
uint256 public immutable minDistributionAmount; // Min revenue per distribution
uint256 public immutable depositDeadline;    // Deadline for principal deposit
```

## Lifecycle

### 1. Creation (via Factory)

```solidity
escrowFactory.createEscrowSeries(
    "My Guaranteed Bond",   // name
    "PROTO-GB",             // symbol
    msg.sender,             // protocol (must be msg.sender)
    2000,                   // 20% revenue share
    180,                    // 180 days
    1000000e18,             // 1M tokens
    500 ether,              // 500 ETH principal
    0.001 ether,            // min distribution
    30                      // 30 days deposit deadline
);
// State: PendingPrincipal
// TotalSupply: 0
```

### 2. Deposit Principal

```solidity
// Protocol deposits exact principal amount
escrow.depositPrincipal{value: 500 ether}();
// State: Active
// TotalSupply: 1,000,000 tokens (minted to protocol)
// Contract holds: 500 ETH
```

### 3. Start Sale

```solidity
// Protocol sets price and starts selling tokens
escrow.startSale(
    0.001 ether,     // price per token in wei
    treasuryAddress  // receives 2% sale fee
);
```

### 4. Investors Buy Tokens

```solidity
// Investor buys tokens with ETH
escrow.buyTokens{value: 100 ether}(100000e18);
// 2% fee to treasury, 98% to protocol
// Tokens transferred from protocol to buyer
```

### 5. Revenue Distribution

```solidity
// Revenue flows through the Router
router.receiveAndRoute{value: 10 ether}();
// Router splits: 20% (2 ETH) to escrow series, 80% (8 ETH) to protocol
// Revenue distributed proportionally to all token holders
```

### 6. Claim Revenue

```solidity
// Investors claim accumulated revenue at any time
escrow.claimRevenue();
```

### 7. Maturity & Principal Claim

```solidity
// After maturityDate, investors claim their share of principal
escrow.claimPrincipal();
// Principal distributed proportionally based on token balance
// e.g., holding 10% of supply = 10% of principal (50 ETH)
```

## Revenue Accounting

Same Synthetix reward-per-token pattern as RevenueSeries:

```solidity
uint256 public revenuePerTokenStored;
mapping(address => uint256) public userRevenuePerTokenPaid;
mapping(address => uint256) public revenueRewards;
```

Revenue is tracked per-token. When tokens are transferred, the `_update()` hook updates rewards for both sender and receiver before the balance changes.

## Sale Mechanism

| Parameter | Value |
|-----------|-------|
| Sale Fee | 2% (200 BPS) - hardcoded |
| Fee Receiver | Set by protocol via `startSale()` |
| Min Purchase | Set at creation (prevents rounding issues) |

```
Buyer pays ETH → 2% fee to treasury → 98% to protocol → tokens transferred to buyer
```

## Principal Redemption

At maturity, each token holder can claim their proportional share of the escrowed principal:

```
claimable = (principalAmount * balanceOf(user)) / totalTokenSupply
```

Each address can only claim once (tracked by `principalClaimed` mapping).

## Functions

### Protocol Functions

| Function | Description |
|----------|-------------|
| `depositPrincipal()` | Deposit exact principal amount (payable, once only) |
| `startSale(price, treasury)` | Start token sale at given price |
| `stopSale()` | Stop token sale |
| `distributeRevenue()` | Distribute revenue (called by router or protocol) |

### Investor Functions

| Function | Description |
|----------|-------------|
| `buyTokens(amount)` | Buy tokens during active sale (payable) |
| `claimRevenue()` | Claim accumulated revenue |
| `claimPrincipal()` | Claim principal share (after maturity) |
| `calculateClaimableRevenue(addr)` | View claimable revenue |
| `calculateClaimablePrincipal(addr)` | View claimable principal |

### View Functions

| Function | Description |
|----------|-------------|
| `state()` | Current state (0=Pending, 1=Active, 2=Matured, 3=Defaulted) |
| `principalDeposited()` | Whether principal has been deposited |
| `saleActive()` | Whether sale is currently active |
| `tokenPriceWei()` | Current token price |
| `totalRevenueReceived()` | Total revenue distributed |
| `totalPrincipalClaimed()` | Total principal claimed |

## Events

```solidity
event PrincipalDeposited(uint256 amount, uint256 timestamp);
event RevenueReceived(uint256 amount, uint256 timestamp);
event RevenueClaimed(address indexed user, uint256 amount);
event PrincipalClaimed(address indexed user, uint256 amount);
event SeriesMatured(uint256 timestamp);
event SeriesDefaulted(uint256 timestamp);
event SaleStarted(uint256 pricePerToken);
event SaleStopped();
event TokensPurchased(address indexed buyer, uint256 tokenAmount, uint256 ethPaid, uint256 fee);
```

## Security Considerations

- **Principal is locked**: Cannot be withdrawn by protocol before maturity
- **Exact deposit required**: `msg.value` must equal `principalAmount` exactly
- **Deposit deadline**: Prevents indefinite PendingPrincipal state
- **ReentrancyGuard**: On all payable/state-changing functions
- **Min purchase amount**: Prevents dust attacks and rounding exploits
- **Single principal claim**: Each address can only claim principal once
