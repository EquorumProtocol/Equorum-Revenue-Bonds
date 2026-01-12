# RevenueRouter.sol

## Overview

`RevenueRouter` is an automated revenue routing contract that captures protocol fees and distributes them between the revenue series (bondholders) and the protocol. It acts as the single fee sink for protocols, ensuring automatic and trustless revenue distribution.

## Key Features

- **Automatic routing**: Accepts ETH from any source and routes it automatically
- **Graceful fallback**: If series is inactive/matured, keeps funds for manual withdrawal
- **Manual withdrawal**: Protocol can withdraw their share without risk of contract bricking
- **Emergency controls**: Owner can withdraw in case of issues
- **Status monitoring**: View functions for tracking routing metrics

## Architecture

### Configuration
```solidity
address public protocol;                // Protocol address (receives remainder)
address payable public revenueSeries;   // RevenueSeries contract
uint256 public revenueShareBPS;         // Share for series (e.g., 2000 = 20%)
bool private seriesAddressSet;          // Ensures series is set only once
```

### Tracking Metrics
```solidity
uint256 public totalRevenueReceived;    // Total ETH received
uint256 public totalRoutedToSeries;     // Total sent to series
uint256 public totalReturnedToProtocol; // Total withdrawn by protocol
uint256 public failedRouteCount;        // Number of failed routing attempts
```

## Core Functions

### receive()
```solidity
receive() external payable
```
- **Caller**: Anyone (protocol, users, contracts)
- **Purpose**: Accept ETH from any source
- **Logic**: 
  - Increments `totalRevenueReceived`
  - Emits `RevenueReceived` event
  - Funds accumulate in contract
- **Design decision**: Accepts from anyone for resilience (protocol upgrades won't break router)

### receiveAndRoute()
```solidity
function receiveAndRoute() external payable
```
- **Caller**: Anyone
- **Purpose**: Accept ETH and immediately attempt routing
- **Logic**: Calls `receive()` then `_tryRouteRevenue()`
- **Use case**: Protocol can call this to route in same transaction as fee generation

### routeRevenue()
```solidity
function routeRevenue() external nonReentrant
```
- **Caller**: Anyone (keepers, bots, protocol)
- **Purpose**: Route accumulated ETH to series and protocol
- **Logic**: Calls internal `_tryRouteRevenue()`
- **Design**: Permissionless for automation (Gelato, Chainlink Keepers, etc.)

### _tryRouteRevenue() (internal)
```solidity
function _tryRouteRevenue() internal
```
**Logic flow:**
1. Check series is set (`require(revenueSeries != address(0))`)
2. Check balance > 0
3. Get series status (active, matured, timeRemaining)
4. **If series inactive/matured:**
   - Increment `failedRouteCount`
   - Keep funds in router
   - Emit `RouteAttemptFailed`
   - Return (no revert)
5. **If series active:**
   - Calculate splits: `seriesAmount = balance * revenueShareBPS / 10000`
   - Try to send to series with `try/catch`:
     - **Success**: Update metrics, emit `RevenueRouted`
     - **Failure**: Increment `failedRouteCount`, keep funds, emit `RouteAttemptFailed`

**Key design decisions:**
- Never reverts on routing failure (graceful fallback)
- Funds stay in router if routing fails
- Protocol can withdraw manually via `withdrawToProtocol()`

### withdrawToProtocol()
```solidity
function withdrawToProtocol(uint256 amount) external nonReentrant
```
- **Caller**: Protocol or owner
- **Purpose**: Withdraw specific amount to protocol
- **Logic**: 
  - Transfers `amount` to protocol
  - Updates `totalReturnedToProtocol`
- **Protection**: Only protocol or owner can call

### withdrawAllToProtocol()
```solidity
function withdrawAllToProtocol() external nonReentrant
```
- **Caller**: Protocol or owner
- **Purpose**: Withdraw all accumulated funds to protocol
- **Use case**: After series matures, protocol withdraws remainder

### emergencyWithdraw()
```solidity
function emergencyWithdraw(address payable to) external onlyOwner nonReentrant
```
- **Caller**: Owner only
- **Purpose**: Emergency recovery if router is stuck
- **Use case**: Critical bug or unexpected behavior

### updateSeriesAddress()
```solidity
function updateSeriesAddress(address payable _revenueSeries) external
```
- **Caller**: Owner or protocol
- **Purpose**: Set series address during deployment (called by factory)
- **Protection**: Can only be set once (`seriesAddressSet` flag)

### getRouterStatus()
```solidity
function getRouterStatus() external view returns (
    uint256 currentBalance,
    uint256 totalReceived,
    uint256 totalToSeries,
    uint256 totalToProtocol,
    uint256 failedAttempts,
    uint256 shareBPS,
    bool canRouteNow
)
```
- **Purpose**: Get complete router state
- **Returns**: All metrics + whether routing is currently possible
- **Use case**: Monitoring, UIs, analytics

## Routing Flow Examples

### Happy Path
```
1. Protocol generates 10 ETH in fees
2. Fees sent to router (receive())
3. Keeper calls routeRevenue()
4. Router checks series is active ✓
5. Calculates: 2 ETH to series (20%), 8 ETH remainder
6. Sends 2 ETH to series.distributeRevenue()
7. 8 ETH stays in router
8. Protocol calls withdrawToProtocol(8 ETH)
```

### Series Matured
```
1. Router has 5 ETH accumulated
2. Keeper calls routeRevenue()
3. Router checks series → matured ✗
4. Increments failedRouteCount
5. Funds stay in router
6. Emits RouteAttemptFailed("Series inactive or matured", 5 ETH)
7. Protocol calls withdrawAllToProtocol()
```

### Series Rejects Distribution
```
1. Router tries to route 10 ETH
2. Series is active ✓
3. Calculates: 2 ETH to series
4. Calls series.distributeRevenue{value: 2 ETH}()
5. Series reverts (e.g., supply = 0)
6. try/catch catches error
7. Increments failedRouteCount
8. All 10 ETH stays in router
9. Protocol withdraws manually
```

## Events

```solidity
event RevenueReceived(address indexed from, uint256 amount, uint256 timestamp);
event RevenueRouted(uint256 seriesAmount, uint256 protocolAmount, uint256 timestamp);
event RouteAttemptFailed(string reason, uint256 amount);
event EmergencyWithdraw(address indexed to, uint256 amount);
```

## Security Features

1. **ReentrancyGuard**: All state-changing functions protected
2. **Graceful fallback**: Never reverts on routing failure
3. **Manual withdrawal**: Protocol can always recover funds
4. **Series validation**: Checks series is set and active before routing
5. **Try/catch**: Catches series rejections without reverting
6. **Emergency controls**: Owner can recover in critical situations

## Integration Example

```solidity
// Protocol integrates router as fee sink
contract MyProtocol {
    RevenueRouter public router;
    
    function collectFees() external {
        uint256 fees = calculateFees();
        
        // Option 1: Send and route in one tx
        router.receiveAndRoute{value: fees}();
        
        // Option 2: Just send (route later)
        payable(address(router)).transfer(fees);
    }
    
    function withdrawMyShare() external onlyOwner {
        router.withdrawAllToProtocol();
    }
}

// Keeper automation (Gelato/Chainlink)
function keeperTask() external {
    RevenueRouter router = RevenueRouter(routerAddress);
    (uint256 balance,,,,,,bool canRoute) = router.getRouterStatus();
    
    if (balance > 0.01 ether && canRoute) {
        router.routeRevenue();
    }
}
```

## Design Decisions

### Why accept ETH from anyone?
- **Resilience**: If protocol upgrades, old router still works
- **Flexibility**: Multiple sources can send fees
- **Simplicity**: No whitelist management

### Why manual withdrawal instead of automatic?
- **Safety**: Prevents bricking if protocol doesn't accept ETH
- **Gas efficiency**: Protocol controls when to withdraw
- **Flexibility**: Protocol can batch withdrawals

### Why try/catch on series distribution?
- **Graceful degradation**: Routing failure doesn't break protocol
- **Funds safety**: ETH never lost, always recoverable
- **Monitoring**: Failed routes tracked in metrics

## Risks & Limitations

1. **Protocol must withdraw**: Funds don't auto-return (by design)
2. **ETH only**: Current version only supports ETH
3. **Anyone can route**: Could be called with dust amounts (spam events)
4. **No enforcement**: Doesn't verify protocol is sending correct total fees

## Future Improvements

- `minRouteAmount` to prevent dust routing
- Support for ERC-20 fee tokens
- Batch routing for multiple series
- On-chain keeper incentives
- Automatic withdrawal scheduling
