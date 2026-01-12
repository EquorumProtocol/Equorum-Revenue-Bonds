# Scripts - Revenue Bonds Protocol

## Available Scripts

**For developers**: Use these scripts to deploy and test the protocol.

- `full_demo.js` - Complete demo (deploy + distribute + claim) in one script
- `deploy_mvp.js` - Deploy factory and create demo series
- `demo_end_to_end.js` - Run full flow demo (requires prior deployment)

## Quick Start

### Option 1: Full Demo (Recommended for Testing)

```bash
# Local - Complete demo in one command
npx hardhat run scripts/full_demo.js
```

**What it does:**
1. Deploys Factory + Series + Router
2. Distributes tokens to Alice (30%) & Bob (20%)
3. Sends 10 ETH revenue to router
4. Routes 20% to series, 80% to protocol
5. Alice & Bob claim their rewards
6. Prints all metrics and verification

---

### Option 2: Separate Deploy + Demo

**Step 1: Deploy**
```bash
# Local (Hardhat Network)
npx hardhat run scripts/deploy_mvp.js

# Arbitrum Sepolia (Testnet)
npx hardhat run scripts/deploy_mvp.js --network arbitrum-sepolia

# Arbitrum One (Mainnet)
npx hardhat run scripts/deploy_mvp.js --network arbitrum-one
```

**Output:**
- Factory address
- Demo Series address
- Demo Router address
- Saved to `deployments/deployment-{network}-latest.json`

---

**Step 2: Run Demo**
```bash
# Local
npx hardhat run scripts/demo_end_to_end.js

# Arbitrum Sepolia
npx hardhat run scripts/demo_end_to_end.js --network arbitrum-sepolia
```

**What it does:**
1. Loads deployment from previous step
2. Distributes tokens to Alice (30%) & Bob (20%)
3. Protocol sends 10 ETH revenue to router
4. Router routes 20% to series, 80% to protocol
5. Alice & Bob claim their rewards
6. Prints all metrics

**Expected Output:**
```
Key Metrics:
  seriesAddress:           0x...
  routerAddress:           0x...
  revenuePerTokenStored:   0.000002
  claimable(Alice):        0.0 ETH (claimed)
  claimable(Bob):          0.0 ETH (claimed)

Revenue Flow:
  Revenue sent:          10.0 ETH
  To series (20%):       2.0 ETH
  To protocol (80%):     8.0 ETH (in router)

Claims:
  Alice claimed:         0.6 ETH
  Bob claimed:           0.4 ETH
  Protocol remaining:    1.0 ETH
```

---

## Network Configuration

Add to `hardhat.config.ts`:

```typescript
networks: {
  "arbitrum-sepolia": {
    url: "https://sepolia-rollup.arbitrum.io/rpc",
    chainId: 421614,
    accounts: [process.env.PRIVATE_KEY!]
  },
  "arbitrum-one": {
    url: "https://arb1.arbitrum.io/rpc",
    chainId: 42161,
    accounts: [process.env.PRIVATE_KEY!]
  }
}
```

---

## Environment Setup

Create `.env`:

```bash
PRIVATE_KEY=your_private_key_here
ARBISCAN_API_KEY=your_arbiscan_api_key_here
```

---

## Verify Contracts

After deployment, verify on Arbiscan:

```bash
npx hardhat verify --network arbitrum-sepolia <FACTORY_ADDRESS>

npx hardhat verify --network arbitrum-sepolia <SERIES_ADDRESS> \
  "Demo Revenue Series" \
  "DEMO-REV" \
  <PROTOCOL_ADDRESS> \
  <ROUTER_ADDRESS> \
  2000 \
  365 \
  "1000000000000000000000000"

npx hardhat verify --network arbitrum-sepolia <ROUTER_ADDRESS> \
  <PROTOCOL_ADDRESS> \
  <SERIES_ADDRESS> \
  2000
```

---

## Deployment Files

Deployments are saved to `deployments/` directory:

- `deployment-{network}-latest.json` - Most recent deployment
- `deployment-{network}-{timestamp}.json` - Historical deployments

**Example:**
```json
{
  "network": "arbitrum-sepolia",
  "timestamp": "2026-01-07T20:00:00.000Z",
  "factory": "0x...",
  "demoSeries": {
    "series": "0x...",
    "router": "0x...",
    "name": "Demo Revenue Series",
    "symbol": "DEMO-REV",
    "protocol": "0x...",
    "revenueShareBPS": 2000,
    "durationDays": 365,
    "totalSupply": "1000000.0"
  }
}
```

---

## Troubleshooting

### Error: "No deployment found"
Run `deploy_mvp.ts` first before running `demo_end_to_end.ts`

### Error: "Insufficient funds"
Make sure deployer account has enough ETH for gas

### Error: "Series matured"
Series has reached maturity date. Create a new series for continued revenue distribution.

---

## Which Script Should I Use?

**For local testing**: Use `full_demo.js` - fastest way to see everything work

**For testnet deployment**: Use `deploy_mvp.js` then `demo_end_to_end.js` separately
- Deploy persists on testnet
- Demo can be run multiple times
- Easier to share deployment addresses

**For mainnet**: Use `deploy_mvp.js` only
- Don't run demo on mainnet
- Deploy factory once
- Create series via factory as needed

---

## Next Steps

After successful testnet deployment:

1. Share explorer links (Arbiscan)
2. Run demo for stakeholders
3. Test with real users on testnet
4. Deploy to mainnet when ready
