# RevenueSeries.sol

## Overview

`RevenueSeries` is an ERC-20 token contract that represents a single revenue bond series. Each series tokenizes a fixed percentage of a protocol's future revenue for a defined period.

## Key Features

- **Fungible ERC-20 tokens**: Fully tradeable and composable with DeFi protocols
- **Immutable terms**: Protocol, revenue share %, maturity date, and supply are set at creation
- **Automatic revenue distribution**: Revenue is distributed proportionally to all token holders
- **Transfer-safe accounting**: Rewards are correctly tracked even when tokens are transferred
- **Relayer support**: Anyone can claim on behalf of users (gas abstraction)

## Architecture

### Immutable Terms
```solidity
address public immutable protocol;      // Protocol issuing the series
address public immutable router;        // Authorized router for distribution
uint256 public immutable revenueShareBPS; // Revenue share (e.g., 2000 = 20%)
uint256 public immutable maturityDate;  // Unix timestamp when series expires
uint256 public immutable totalTokenSupply; // Fixed token supply
```

### Revenue Accounting

The contract uses a **staking-rewards pattern** for correct accounting:

```solidity
uint256 public revenuePerTokenStored;  // Accumulated revenue per token (scaled by 1e18)
mapping(address => uint256) public userRevenuePerTokenPaid; // Last update index per user
mapping(address => uint256) public rewards; // Accumulated claimable rewards
```

**How it works:**
1. When revenue is distributed, `revenuePerTokenStored` increases
2. Before any balance change (transfer/mint/burn), `_updateRewards()` is called
3. User's pending rewards are calculated and added to their `rewards` balance
4. `userRevenuePerTokenPaid` is updated to current `revenuePerTokenStored`

This ensures that:
- Users only earn rewards for tokens they hold
- Transferring tokens doesn't "steal" or "lose" rewards
- Multiple distributions are correctly accumulated

## Core Functions

### distributeRevenue()
```solidity
function distributeRevenue() external payable
```
- **Caller**: Protocol or authorized router
- **Purpose**: Distribute ETH revenue to all token holders
- **Logic**: Increases `revenuePerTokenStored` by `(msg.value * 1e18) / totalSupply()`
- **Protections**: 
  - Only protocol or router can call
  - Series must be active
  - Must not be matured
  - Supply must be > 0 (prevents division by zero)

### claimRevenue()
```solidity
function claimRevenue() external nonReentrant
```
- **Caller**: Any token holder
- **Purpose**: Claim accumulated ETH rewards
- **Logic**: 
  1. Updates rewards for caller
  2. Transfers accumulated rewards to caller
  3. Resets rewards to 0
- **Protection**: ReentrancyGuard

### claimFor(address user)
```solidity
function claimFor(address user) external nonReentrant
```
- **Caller**: Anyone (relayer/UI)
- **Purpose**: Claim rewards on behalf of a user (gas abstraction)
- **Logic**: Same as `claimRevenue()` but pays to `user` instead of `msg.sender`
- **Use case**: Relayers can batch claims, UIs can sponsor gas

### calculateClaimable(address account)
```solidity
function calculateClaimable(address account) external view returns (uint256)
```
- **Returns**: Total claimable rewards (accumulated + pending)
- **Logic**: `rewards[account] + (balance * (revenuePerTokenStored - userRevenuePerTokenPaid[account])) / 1e18`

### matureSeries()
```solidity
function matureSeries() external
```
- **Caller**: Anyone (permissionless)
- **Purpose**: Mark series as inactive after maturity date
- **Effect**: Prevents new revenue distributions

## Transfer Accounting

The `_update()` hook ensures correct accounting on transfers:

```solidity
function _update(address from, address to, uint256 value) internal override {
    _updateRewards(from);  // Update sender's rewards before balance changes
    _updateRewards(to);    // Update receiver's rewards before balance changes
    super._update(from, to, value); // Execute transfer
}
```

**Example scenario:**
1. Alice holds 1000 tokens
2. Revenue of 10 ETH is distributed → `revenuePerTokenStored` increases
3. Alice transfers 500 tokens to Bob
4. `_updateRewards(Alice)` calculates her rewards for 1000 tokens
5. `_updateRewards(Bob)` updates his baseline (he had 0 before)
6. Transfer executes
7. Future revenue is split correctly based on new balances

## Events

```solidity
event SeriesConfigured(
    address indexed protocol,
    address indexed router,
    uint256 revenueShareBPS,
    uint256 maturityDate,
    uint256 totalSupply
);
event RevenueReceived(uint256 amount, uint256 timestamp);
event RevenueClaimed(address indexed user, uint256 amount);
event SeriesMatured(uint256 timestamp);
```

## Security Features

1. **ReentrancyGuard**: Protects claim functions
2. **Immutable terms**: Cannot be changed after deployment
3. **Division by zero protection**: Checks `totalSupply() > 0` before distribution
4. **Transfer-safe accounting**: Rewards tracked correctly on transfers
5. **No receive() fallback**: Forces explicit `distributeRevenue()` call

## Integration Example

```solidity
// Protocol creates series via factory
(address series, address router) = factory.createSeries(
    "Camelot Revenue 20% 12M",
    "CAMELOT-REV-20-12M",
    protocolAddress,
    2000,  // 20%
    365,   // 12 months
    1_000_000 * 1e18
);

// Protocol routes fees through router
// Router automatically calls series.distributeRevenue()

// Users claim rewards
RevenueSeries(series).claimRevenue();

// Or relayer claims for user
RevenueSeries(series).claimFor(userAddress);
```

## Risks & Limitations

1. **Protocol trust**: Series assumes protocol will deposit correct revenue share
2. **ETH only**: Current version only supports ETH (not ERC-20 tokens)
3. **No enforcement**: Contract doesn't verify protocol is sending correct %
4. **Maturity is soft**: After maturity, series stops accepting revenue but tokens remain tradeable

## Future Improvements

- Support for ERC-20 fee tokens (USDC, ARB, etc.)
- On-chain enforcement of revenue share %
- Batch claim for multiple users
- Snapshot-based airdrops
