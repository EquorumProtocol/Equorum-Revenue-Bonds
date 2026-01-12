# Mainnet Deployment Guide - Equorum Revenue Bonds Protocol

**Complete guide for deploying to Arbitrum One mainnet**

---

## Pre-Deployment Checklist

### 1. Security Review
- [ ] All 360 tests passing
- [ ] Gas costs reviewed and acceptable
- [ ] Code reviewed by team
- [ ] Consider professional audit (recommended for mainnet)
- [ ] Emergency procedures documented

### 2. Infrastructure Setup
- [ ] **Treasury Address**: Set up multisig (recommend Gnosis Safe)
- [ ] **Deployer Wallet**: Funded with sufficient ETH for deployment (~$50-100)
- [ ] **RPC Provider**: Reliable Arbitrum One RPC (Alchemy, Infura, or Quicknode)
- [ ] **Block Explorer**: Arbiscan API key for verification

### 3. Configuration Decisions
- [ ] **Initial Treasury**: Multisig address (can be changed later)
- [ ] **Fee Policy**: Start with fees disabled (enable after testing)
- [ ] **Creation Fee Amount**: If enabling fees, start low (0.01-0.1 ETH)
- [ ] **Ownership Transfer**: Plan to transfer Factory ownership to multisig

### 4. Frontend & Monitoring
- [ ] Frontend ready to integrate
- [ ] Indexer/subgraph prepared (optional)
- [ ] Monitoring/alerting set up
- [ ] Documentation for protocols

---

## Deployment Steps

### Step 1: Environment Setup

Create `.env` file:
```bash
# Arbitrum One Mainnet
ARBITRUM_ONE_RPC_URL=https://arb1.arbitrum.io/rpc
DEPLOYER_PRIVATE_KEY=your_private_key_here
ARBISCAN_API_KEY=your_arbiscan_api_key

# Treasury Configuration
TREASURY_ADDRESS=0x... # Your multisig address

# Fee Configuration (optional, can be set later)
FEES_ENABLED=false
CREATION_FEE_ETH=0.01
```

### Step 2: Update Hardhat Config

Ensure `hardhat.config.js` has Arbitrum One network:
```javascript
networks: {
  arbitrumOne: {
    url: process.env.ARBITRUM_ONE_RPC_URL,
    chainId: 42161,
    accounts: [process.env.DEPLOYER_PRIVATE_KEY]
  }
}
```

### Step 3: Deploy Factory

```bash
npx hardhat run scripts/deploy_mvp.js --network arbitrumOne
```

**Expected Output:**
```
[DEPLOY] Deploying RevenueSeriesFactory...
[DEPLOY] Treasury: 0x...
[DEPLOY] Factory deployed to: 0x...
[DEPLOY] Gas used: ~4,162,266
[DEPLOY] Cost: ~$X.XX
```

**Save these addresses immediately:**
- Factory Address
- Transaction Hash
- Block Number
- Deployer Address

### Step 4: Verify Contracts on Arbiscan

```bash
npx hardhat verify --network arbitrumOne FACTORY_ADDRESS "TREASURY_ADDRESS"
```

### Step 5: Create Demo Series (Optional)

Test the factory with a demo series:
```bash
npx hardhat run scripts/create_demo_series.js --network arbitrumOne
```

### Step 6: Transfer Ownership to Multisig

**CRITICAL:** Transfer Factory ownership to multisig for security:

```javascript
const factory = await ethers.getContractAt("RevenueSeriesFactory", FACTORY_ADDRESS);
await factory.transferOwnership(MULTISIG_ADDRESS);
```

### Step 7: Configure Initial Settings (via Multisig)

Using your multisig:

1. **Set Treasury** (if different from initial):
```javascript
await factory.setTreasury(NEW_TREASURY_ADDRESS);
```

2. **Configure Fees** (when ready):
```javascript
await factory.setFees(true, ethers.parseEther("0.01")); // 0.01 ETH
```

---

## Post-Deployment

### Immediate Actions

1. **Document Addresses**
   - Save all contract addresses
   - Update frontend configuration
   - Update documentation

2. **Verify Deployment**
   ```bash
   npx hardhat run scripts/verify_deployment.js --network arbitrumOne
   ```

3. **Test Basic Operations**
   - Create a test series
   - Send test revenue
   - Verify routing works
   - Test claim functionality

4. **Monitor Initial Usage**
   - Watch for any unexpected behavior
   - Monitor gas costs
   - Track first series creations

### Security Monitoring

Set up alerts for:
- Large ETH transfers to/from contracts
- Ownership changes
- Pause events
- Failed transactions
- Unusual gas consumption

### Communication

1. **Announce Deployment**
   - Twitter announcement
   - Discord notification
   - Update website

2. **Provide Documentation**
   - Integration guide for protocols
   - User guide for holders
   - Gas cost estimates
   - Example transactions

---

## Configuration Management

### Fee Strategy

**Phase 1: Launch (Month 1-3)**
- Fees: **Disabled**
- Goal: Attract early protocols, gather feedback
- Monitor: Series creation rate, user feedback

**Phase 2: Soft Launch (Month 4-6)**
- Fees: **Enabled at 0.01 ETH**
- Goal: Test fee collection, minimal friction
- Monitor: Impact on creation rate, treasury accumulation

**Phase 3: Optimization (Month 7+)**
- Fees: **Adjust based on data** (0.05-0.1 ETH)
- Goal: Sustainable revenue, fair pricing
- Monitor: Protocol feedback, competitive landscape

### Ownership & Governance

**Immediate (Day 1)**
- Owner: Multisig (3/5 or 4/7 recommended)
- Signers: Core team members

**Short-term (Month 1-6)**
- Owner: Same multisig
- Review: Emergency procedures, pause criteria

**Long-term (Month 6+)**
- Consider: Timelock contract
- Consider: DAO governance (if EQM token launched)

---

## Emergency Procedures

### Scenario 1: Critical Bug Discovered

1. **Pause Factory** (stops new series creation)
   ```javascript
   await factory.pause();
   ```

2. **Assess Impact**
   - Which series are affected?
   - Is user funds at risk?
   - Can existing series continue operating?

3. **Communicate**
   - Immediate Discord/Twitter announcement
   - Explain situation transparently
   - Provide timeline for resolution

4. **Remediation**
   - Deploy fixed version (new factory)
   - Migrate if necessary
   - Compensate affected users if needed

### Scenario 2: Router Malfunction

1. **Pause Affected Router** (protocol-specific)
   ```javascript
   await router.pause();
   ```

2. **Protocol Withdraws Funds**
   ```javascript
   await router.withdrawAllToProtocol();
   ```

3. **Investigate & Fix**
   - Identify root cause
   - Deploy new router if needed
   - Update series router reference (if possible)

### Scenario 3: Treasury Compromise

1. **Update Treasury Address Immediately**
   ```javascript
   await factory.setTreasury(NEW_SAFE_ADDRESS);
   ```

2. **Disable Fees Temporarily**
   ```javascript
   await factory.setFees(false, 0);
   ```

3. **Audit & Secure**
   - Review all transactions
   - Secure new treasury
   - Re-enable fees when safe

---

## Gas Cost Management

### Optimization Tips for Protocols

1. **Batch Operations**
   - Create multiple series in same block (if needed)
   - Route revenue in batches (daily vs hourly)

2. **Timing**
   - Deploy during low gas periods (weekends, late night UTC)
   - Monitor Arbitrum gas prices: https://arbiscan.io/gastracker

3. **Fee Structure**
   - Consider creation fee vs ongoing costs
   - Factor into bond pricing

### Cost Estimates (Reference)

| Operation | Gas | @ 0.1 gwei | @ 0.5 gwei | @ 2 gwei |
|-----------|-----|------------|------------|----------|
| Deploy Factory | 4,162,266 | $0.83 | $4.16 | $16.65 |
| Create Series | 2,621,222 | $0.52 | $2.62 | $10.48 |
| Route Revenue | 64,974 | $0.01 | $0.065 | $0.26 |
| Claim Revenue | 53,965 | $0.01 | $0.054 | $0.22 |

*Assumes ETH @ $2000*

---

## Integration Guide for Protocols

### Step 1: Understand Your Revenue Model

Before creating a series, determine:
- **Revenue Share**: What % to offer? (10-30% typical)
- **Duration**: How long? (6-12 months typical)
- **Supply**: How many tokens? (100K-1M typical)
- **Pricing**: What's fair value per token?

### Step 2: Create Series

```javascript
const factory = await ethers.getContractAt(
    "RevenueSeriesFactory",
    FACTORY_ADDRESS
);

const tx = await factory.createSeries(
    "YourProtocol Revenue Bond - 20% 12M",
    "YOURPROTO-REV-20-12M",
    yourProtocol.address,
    2000, // 20%
    365,  // 12 months
    ethers.parseEther("1000000") // 1M tokens
);

const receipt = await tx.wait();
// Extract series and router addresses from event
```

### Step 3: Distribute Tokens

```javascript
const series = await ethers.getContractAt("RevenueSeries", seriesAddress);

// Option A: Sell directly
await series.transfer(buyer1, amount1);
await series.transfer(buyer2, amount2);

// Option B: Create Uniswap pool
// 1. Create pool
// 2. Add liquidity
// 3. Let market discover price

// Option C: Auction (Gnosis Auction, etc.)
```

### Step 4: Send Revenue

```javascript
// Automatic routing (recommended)
await yourProtocol.sendTransaction({
    to: routerAddress,
    value: revenueAmount
});
await router.routeRevenue();

// Or combined
await router.receiveAndRoute({ value: revenueAmount });
```

### Step 5: Monitor & Communicate

- Track revenue sent vs claimed
- Communicate with bondholders
- Provide transparency reports
- Consider creating dashboard

---

## Troubleshooting

### Issue: Transaction Fails with "Invalid BPS"
**Cause:** Revenue share > 50%
**Solution:** Use 5000 (50%) or less

### Issue: Transaction Fails with "Invalid duration"
**Cause:** Duration < 30 days or > 1825 days
**Solution:** Use 30-1825 days

### Issue: Transaction Fails with "Supply too low"
**Cause:** Supply < 1000 tokens
**Solution:** Use at least 1000 * 10^18

### Issue: Transaction Fails with "Insufficient fee"
**Cause:** Fees enabled but not enough ETH sent
**Solution:** Check `factory.getFeeConfig()` and send correct amount

### Issue: Router Not Routing
**Cause:** Router paused or series matured
**Solution:** Check `router.paused()` and series maturity date

### Issue: Claim Fails
**Cause:** No claimable revenue or series matured
**Solution:** Check `series.calculateClaimable(address)`

---

## Maintenance & Upgrades

### Regular Maintenance

**Weekly:**
- Monitor contract health
- Review gas costs
- Check for anomalies

**Monthly:**
- Review fee strategy
- Analyze usage metrics
- Gather protocol feedback

**Quarterly:**
- Security review
- Performance optimization
- Feature planning

### Upgrade Path (V2)

When ready for V2:
1. Deploy new Factory (V2)
2. Keep V1 Factory operational
3. Gradually migrate protocols
4. Eventually deprecate V1 (after all series mature)

**Note:** Existing series are immutable and will continue operating regardless of factory version.

---

## Support & Resources

### For Protocols
- Integration docs: [docs.equorum.io/integration](https://docs.equorum.io/integration)
- Discord support: [discord.gg/equorum](https://discord.gg/equorum)
- Email: integrations@equorum.io

### For Developers
- GitHub: [github.com/equorum/revenue-bonds](https://github.com/equorum/revenue-bonds)
- Technical docs: [docs.equorum.io/technical](https://docs.equorum.io/technical)
- Bug bounty: [immunefi.com/equorum](https://immunefi.com/equorum)

### For Users
- User guide: [docs.equorum.io/users](https://docs.equorum.io/users)
- FAQ: [equorum.io/faq](https://equorum.io/faq)
- Support: support@equorum.io

---

## Appendix: Contract Addresses

### Arbitrum One Mainnet
```
Factory: 0x... (to be deployed)
```

### Arbitrum Sepolia Testnet
```
Factory: 0x2B2b7DC0b8276b74dEb57bB30b7AA66697DF7dA8
Demo Series: 0xb42751FFBCFbe76dd5Fc919088B2a81B52C48D19
Demo Router: 0x3D170736435F9D2e3eC7164dA56EC1DE0dd24A5F
```

---

**Last Updated:** January 2026
**Version:** 1.0.0
**Status:** Mainnet Ready
