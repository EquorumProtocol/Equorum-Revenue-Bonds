# RevenueSeriesFactory.sol

## Overview

`RevenueSeriesFactory` is a factory contract that deploys new revenue bond series. It creates both the `RevenueSeries` (ERC-20 token) and `RevenueRouter` (fee routing) contracts in a single transaction, ensuring they are correctly linked and configured.

## Key Features

- **One-click deployment**: Creates series + router in single transaction
- **Automatic linking**: Router and series are pre-configured to work together
- **Registry**: Maintains on-chain registry of all series and their routers
- **Access control**: Only protocol can create series in their own name (anti-spam)
- **Ownership transfer**: Automatically transfers ownership to protocol

## Architecture

### Registry
```solidity
address[] public allSeries;                      // All created series
mapping(address => address[]) public seriesByProtocol; // Series by protocol
mapping(address => address) public routerBySeries;     // Series → Router mapping
```

## Core Function

### createSeries()
```solidity
function createSeries(
    string memory name,
    string memory symbol,
    address protocol,
    uint256 revenueShareBPS,
    uint256 durationDays,
    uint256 totalSupply
) external returns (address seriesAddress, address routerAddress)
```

**Parameters:**
- `name`: Token name (e.g., "Equorum Revenue - Camelot 20% 12M")
- `symbol`: Token symbol (e.g., "EQREV-CAMELOT-20-12M")
- `protocol`: Protocol address (must be msg.sender)
- `revenueShareBPS`: Revenue share in basis points (2000 = 20%)
- `durationDays`: Duration in days (365 = 1 year)
- `totalSupply`: Total token supply with 18 decimals (1_000_000 * 1e18)

**Returns:**
- `seriesAddress`: Address of created RevenueSeries contract
- `routerAddress`: Address of created RevenueRouter contract

**Validations:**
```solidity
require(msg.sender == protocol, "Only protocol can create series");
require(protocol != address(0), "Invalid protocol");
require(revenueShareBPS > 0 && revenueShareBPS <= 10000, "Invalid BPS");
require(durationDays > 0, "Invalid duration");
require(totalSupply > 0, "Invalid supply");
```

**Deployment Flow:**

1. **Create Router** (with temporary series address):
   ```solidity
   RevenueRouter router = new RevenueRouter(
       protocol,
       payable(address(0)), // Temporary, will be set after series creation
       revenueShareBPS
   );
   ```

2. **Create Series** (with router address):
   ```solidity
   RevenueSeries series = new RevenueSeries(
       name,
       symbol,
       protocol,
       routerAddress,
       revenueShareBPS,
       durationDays,
       totalSupply
   );
   ```

3. **Update Router** (with series address):
   ```solidity
   router.updateSeriesAddress(payable(seriesAddress));
   ```

4. **Register** in mappings:
   ```solidity
   allSeries.push(seriesAddress);
   seriesByProtocol[protocol].push(seriesAddress);
   routerBySeries[seriesAddress] = routerAddress;
   ```

5. **Transfer Ownership** to protocol:
   ```solidity
   series.transferOwnership(protocol);
   router.transferOwnership(protocol);
   ```

**Why this order?**
- Router needs to exist before series (series stores router address as immutable)
- Series needs to exist before router is finalized (router needs series address)
- Solution: Create router with temp address, create series, update router

## View Functions

### getSeriesByProtocol()
```solidity
function getSeriesByProtocol(address protocol) external view returns (address[] memory)
```
- **Returns**: Array of all series created by a protocol
- **Use case**: Protocol dashboard, analytics

### getTotalSeries()
```solidity
function getTotalSeries() external view returns (uint256)
```
- **Returns**: Total number of series created
- **Use case**: Protocol metrics, leaderboards

### getRouterForSeries()
```solidity
function getRouterForSeries(address series) external view returns (address)
```
- **Returns**: Router address for a given series
- **Use case**: Integration, routing fees to correct router

## Events

```solidity
event SeriesCreated(
    address indexed series,
    address indexed router,
    address indexed protocol,
    string name,
    string symbol,
    uint256 revenueShareBPS,
    uint256 durationDays,
    uint256 totalSupply
);
```

**Use cases:**
- Indexing (The Graph, Dune Analytics)
- Protocol notifications
- UI updates
- Analytics dashboards

## Integration Example

### Protocol Creates Series

```solidity
// Protocol calls factory
RevenueSeriesFactory factory = RevenueSeriesFactory(factoryAddress);

(address series, address router) = factory.createSeries(
    "Camelot Revenue 20% 12M",     // name
    "CAMELOT-REV-20-12M",          // symbol
    address(this),                  // protocol (must be msg.sender)
    2000,                           // 20% revenue share
    365,                            // 12 months
    1_000_000 * 1e18               // 1M tokens
);

// Now protocol can:
// 1. Sell tokens (series) to investors
// 2. Route fees to router
// 3. Withdraw remainder from router
```

### Query Protocol's Series

```solidity
address[] memory mySeries = factory.getSeriesByProtocol(protocolAddress);

for (uint i = 0; i < mySeries.length; i++) {
    address router = factory.getRouterForSeries(mySeries[i]);
    // Display series info, router status, etc.
}
```

### Integration Flow

```
1. Protocol calls factory.createSeries()
   ↓
2. Factory deploys RevenueSeries + RevenueRouter
   ↓
3. Factory transfers ownership to protocol
   ↓
4. Protocol receives series tokens (minted to protocol)
   ↓
5. Protocol sells tokens to investors (Uniswap, OTC, etc.)
   ↓
6. Protocol routes fees to router
   ↓
7. Router distributes to series holders
   ↓
8. Protocol withdraws remainder from router
```

## Security Features

1. **Anti-spam**: Only protocol can create series in their own name
   ```solidity
   require(msg.sender == protocol, "Only protocol can create series");
   ```

2. **Validation**: All parameters validated before deployment

3. **Atomic deployment**: Series + router created in single transaction (no partial state)

4. **Ownership transfer**: Both contracts owned by protocol after creation

5. **Registry**: On-chain record of all series and routers

## Design Decisions

### Why require msg.sender == protocol?
- **Anti-spam**: Prevents anyone from creating series in protocol's name
- **Authorization**: Protocol must explicitly create their own series
- **Accountability**: Clear on-chain record of who created what

### Why transfer ownership?
- **Control**: Protocol controls series and router after creation
- **Flexibility**: Protocol can upgrade, pause, or manage contracts
- **Standard practice**: Factory shouldn't retain control

### Why store registry?
- **Discovery**: Easy to find all series for a protocol
- **Integration**: Routers can be looked up by series address
- **Analytics**: Total series count, protocol rankings, etc.

## Gas Costs

Approximate gas costs (Arbitrum):
- Deploy RevenueSeries: ~2.5M gas
- Deploy RevenueRouter: ~1.5M gas
- Registry updates: ~100K gas
- **Total**: ~4.1M gas per series creation

## Risks & Limitations

1. **No series validation**: Factory doesn't verify protocol will actually use the series
2. **No duplicate prevention**: Protocol can create multiple identical series
3. **No series management**: Factory can't pause/upgrade series after creation
4. **Ownership trust**: Protocol must be trusted with ownership

## Future Improvements

- Whitelist of approved protocols
- Series templates (preset configurations)
- Batch creation for multiple series
- Series upgrade mechanism
- Fee collection for factory operator
- Series verification/auditing

## Example Naming Conventions

Good series names are descriptive and include key terms:

```
Name: "Equorum Revenue - Camelot 20% 12M"
Symbol: "EQREV-CAMELOT-20-12M"

Name: "Equorum Revenue - GMX 15% 6M"
Symbol: "EQREV-GMX-15-6M"

Name: "Equorum Revenue - Uniswap 25% 24M"
Symbol: "EQREV-UNI-25-24M"
```

**Format**: `[Platform] Revenue - [Protocol] [%] [Duration]`

This makes series easily identifiable on:
- DEX listings (Uniswap, Camelot)
- Block explorers (Arbiscan)
- Portfolio trackers (Zapper, DeBank)
- Analytics platforms (Dune, The Graph)
