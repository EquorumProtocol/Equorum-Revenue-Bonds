# Deployment Addresses

> **Official contract addresses for Equorum Revenue Bonds Protocol**

## Table of Contents

- [Arbitrum One (Mainnet)](#arbitrum-one-mainnet)
- [Arbitrum Sepolia (Testnet)](#arbitrum-sepolia-testnet)
- [Verification](#verification)
- [Integration](#integration)
- [Changelog](#changelog)

---

## Arbitrum One (Mainnet)

### Core Protocol V2

| Contract | Address | Verified |
|----------|---------|----------|
| **RevenueSeriesFactory** | [`0x280E83c47E243267753B7E2f322f55c52d4D2C3a`](https://arbiscan.io/address/0x280E83c47E243267753B7E2f322f55c52d4D2C3a) | ✅ |
| **RevenueBondEscrowFactory** | [`0x2CfE9a33050EB77fC124ec3eAac4fA4D687bE650`](https://arbiscan.io/address/0x2CfE9a33050EB77fC124ec3eAac4fA4D687bE650) | ✅ |
| **ProtocolReputationRegistry** | [`0xfe0A22D77fdf98cC556CBc2dC6B3749EBa4E89bA`](https://arbiscan.io/address/0xfe0A22D77fdf98cC556CBc2dC6B3749EBa4E89bA) | ✅ |
| **EscrowDeployer** | [`0x989BCB780EEE189Bc85e04505e59Fd2Fb3CAA843`](https://arbiscan.io/address/0x989BCB780EEE189Bc85e04505e59Fd2Fb3CAA843) | ✅ |
| **RouterDeployer** | [`0x7c80F6312BFD762B958Ccf9DF2E397840c7856d3`](https://arbiscan.io/address/0x7c80F6312BFD762B958Ccf9DF2E397840c7856d3) | ✅ |

### Governance & Treasury

| Contract | Address | Type |
|----------|---------|------|
| **Treasury (Safe Multisig)** | [`0xBa69aEd75E8562f9D23064aEBb21683202c5279B`](https://arbiscan.io/address/0xBa69aEd75E8562f9D23064aEBb21683202c5279B) | Gnosis Safe 1-of-1 |
| **Deployer Wallet** | [`0x48CF80F950E52d6D55537a2A7de0Dbd7e1532f77`](https://arbiscan.io/address/0x48CF80F950E52d6D55537a2A7de0Dbd7e1532f77) | EOA (No power post-deploy) |

### Legacy V1 (Deprecated)

| Contract | Address | Status |
|----------|---------|--------|
| **V1 Factory** | [`0x8afA0318363FfBc29Cc28B3C98d9139C08Af737b`](https://arbiscan.io/address/0x8afA0318363FfBc29Cc28B3C98d9139C08Af737b) | ⚠️ Deprecated - Use V2 |

### Example Series (Genesis)

| Contract | Address | Details |
|----------|---------|---------|
| **Genesis Series** | [`0x88122C5805281bAbF3B172fA212a6F6300Bb1EF3`](https://arbiscan.io/address/0x88122C5805281bAbF3B172fA212a6F6300Bb1EF3) | UNDERDOG-RB, 20%, 180 days |
| **Genesis Router** | [`0x8a4796F943Ed862671115fefAB860AC12B2772eE`](https://arbiscan.io/address/0x8a4796F943Ed862671115fefAB860AC12B2772eE) | Auto-distribution router |

---

## Arbitrum Sepolia (Testnet)

### Core Protocol V2

| Contract | Address | Verified |
|----------|---------|----------|
| **RevenueSeriesFactory** | [`0x2B2b7DC0b8276b74dEb57bB30b7AA66697DF7dA8`](https://sepolia.arbiscan.io/address/0x2B2b7DC0b8276b74dEb57bB30b7AA66697DF7dA8) | ✅ |

### Test Series

| Contract | Address | Details |
|----------|---------|---------|
| **Demo Series** | [`0xb42751FFBCFbe76dd5Fc919088B2a81B52C48D19`](https://sepolia.arbiscan.io/address/0xb42751FFBCFbe76dd5Fc919088B2a81B52C48D19) | DEMO-REV, 20%, 365 days |
| **Demo Router** | [`0x3D170736435F9D2e3eC7164dA56EC1DE0dd24A5F`](https://sepolia.arbiscan.io/address/0x3D170736435F9D2e3eC7164dA56EC1DE0dd24A5F) | Test router |

---

## Verification

### Verify on Arbiscan

All contracts are verified and open source. You can:

1. **View Source Code:**
   - Go to contract address on Arbiscan
   - Click "Contract" tab
   - View verified source code

2. **Verify Deployment:**
   ```bash
   # Using Hardhat
   npx hardhat verify --network arbitrum <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
   ```

3. **Check Bytecode:**
   ```javascript
   // Compare deployed bytecode with compiled bytecode
   const deployedCode = await ethers.provider.getCode(contractAddress);
   const compiledCode = artifacts.readArtifactSync("ContractName").deployedBytecode;
   ```

### Security Checks

Before integrating, verify:

- ✅ Contract is verified on Arbiscan
- ✅ Address matches official documentation
- ✅ Contract owner is Treasury Safe
- ✅ No suspicious recent transactions
- ✅ Contract matches GitHub source code

---

## Integration

### Quick Start (Mainnet)

```javascript
// JavaScript/TypeScript
const FACTORY_ADDRESS = "0x280E83c47E243267753B7E2f322f55c52d4D2C3a";
const ESCROW_FACTORY_ADDRESS = "0x2CfE9a33050EB77fC124ec3eAac4fA4D687bE650";
const REPUTATION_REGISTRY = "0xfe0A22D77fdf98cC556CBc2dC6B3749EBa4E89bA";

// Get factory contract
const factory = await ethers.getContractAt(
    "RevenueSeriesFactory",
    FACTORY_ADDRESS
);

// Create series
const tx = await factory.createSeries(
    "My Revenue Bonds",
    "MY-RB",
    protocolAddress,
    2000, // 20%
    365,  // 1 year
    ethers.parseEther("1000000"), // 1M tokens
    ethers.parseEther("0.01")     // min distribution
);
```

### Solidity Integration

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@equorum/contracts/v2/interfaces/IRevenueSeriesFactory.sol";

contract MyProtocol {
    IRevenueSeriesFactory public constant FACTORY = 
        IRevenueSeriesFactory(0x280E83c47E243267753B7E2f322f55c52d4D2C3a);
    
    function createBonds() external {
        (address series, address router) = FACTORY.createSeries{value: 0}(
            "MyProtocol Revenue Bonds",
            "MYPROTO-RB",
            address(this),
            2000,
            365,
            1_000_000 * 1e18,
            0.01 ether
        );
    }
}
```

### Testing on Sepolia

```javascript
// Use testnet addresses for testing
const TESTNET_FACTORY = "0x2B2b7DC0b8276b74dEb57bB30b7AA66697DF7dA8";

// Get testnet ETH from faucet
// https://faucet.quicknode.com/arbitrum/sepolia

// Create test series
const tx = await factory.createSeries(
    "Test Revenue Bonds",
    "TEST-RB",
    protocolAddress,
    2000,
    30, // 30 days for testing
    ethers.parseEther("1000"),
    ethers.parseEther("0.001")
);
```

---

## Network Information

### Arbitrum One

- **Chain ID:** 42161
- **RPC URL:** `https://arb1.arbitrum.io/rpc`
- **Explorer:** https://arbiscan.io
- **Native Token:** ETH
- **Block Time:** ~0.25 seconds

### Arbitrum Sepolia

- **Chain ID:** 421614
- **RPC URL:** `https://sepolia-rollup.arbitrum.io/rpc`
- **Explorer:** https://sepolia.arbiscan.io
- **Native Token:** ETH (testnet)
- **Faucet:** https://faucet.quicknode.com/arbitrum/sepolia

---

## Contract ABIs

### Get ABIs

**Option 1: From npm package (coming soon)**
```bash
npm install @equorum/contracts
```

**Option 2: From Arbiscan**
- Go to verified contract
- Click "Contract" tab
- Scroll to "Contract ABI"
- Copy JSON

**Option 3: From GitHub**
```bash
git clone https://github.com/EquorumProtocol/Equorum-Revenue-Bonds.git
cd Equorum-Revenue-Bonds
npm install
npm run compile
# ABIs in artifacts/contracts/
```

### Key Interfaces

```solidity
// IRevenueSeriesFactory.sol
interface IRevenueSeriesFactory {
    function createSeries(
        string memory name,
        string memory symbol,
        address protocol,
        uint256 revenueShareBPS,
        uint256 durationDays,
        uint256 totalSupply,
        uint256 minDistributionAmount
    ) external payable returns (address series, address router);
}

// IRevenueSeries.sol
interface IRevenueSeries {
    function distributeRevenue() external payable;
    function claimRevenue() external;
    function earned(address account) external view returns (uint256);
    function getSeriesInfo() external view returns (
        uint256 revenueBPS,
        uint256 maturity,
        uint256 totalRevenue,
        uint256 revenuePerToken,
        bool isActive,
        uint256 timeRemaining
    );
}

// IProtocolReputationRegistry.sol
interface IProtocolReputationRegistry {
    function getProtocolStats(address protocol) external view returns (
        uint256 totalDistributed,
        uint256 distributionCount,
        uint256 averageDistribution,
        uint256 lastDistribution
    );
}
```

---

## Changelog

### V2 Deployment (February 9, 2026)

**Mainnet Deployment:**
- ✅ RevenueSeriesFactory deployed
- ✅ RevenueBondEscrowFactory deployed
- ✅ ProtocolReputationRegistry deployed
- ✅ All contracts verified on Arbiscan
- ✅ Ownership transferred to Treasury Safe
- ✅ Policies set to permissionless (address(0))

**Changes from V1:**
- Added Guaranteed Bonds with escrow
- Added Reputation Registry
- Added pluggable policies (fee, safety, access)
- Added minimum distribution amount
- Improved security (reentrancy, rounding)
- Better event logging

### V1 Deployment (January 12, 2026)

**Mainnet Deployment:**
- ✅ V1 Factory deployed
- ✅ Genesis Series created
- ⚠️ Now deprecated - migrate to V2

---

## Migration from V1 to V2

If you created series on V1, consider migrating to V2:

**V1 Limitations:**
- No escrow option
- No reputation tracking
- No minimum distribution protection
- Limited upgradeability

**Migration Steps:**
1. Create new V2 series with same terms
2. Airdrop new tokens to V1 bondholders
3. Announce migration timeline
4. Distribute remaining V1 revenue
5. Sunset V1 series

**Need help?** Contact dev@equorumprotocol.org

---

## Additional Resources

### Documentation

- **Integration Guide:** [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md)
- **Security:** [SECURITY.md](./SECURITY.md)
- **Whitepaper:** [WHITEPAPER.md](./WHITEPAPER.md)
- **Website:** https://equorumprotocol.org

### Developer Tools

- **Hardhat Config:** See `hardhat.config.js`
- **Test Suite:** `npm test`
- **Deploy Scripts:** `scripts/deploy/`
- **Subgraph:** Coming soon

### Support

- **GitHub:** https://github.com/EquorumProtocol/Equorum-Revenue-Bonds
- **Discord:** [Join our Discord](#)
- **Email:** dev@equorumprotocol.org

---

## Disclaimer

**⚠️ IMPORTANT NOTICES:**

1. **No External Audit Yet:** Protocol has not undergone external security audit. Use at your own risk. External audit scheduled Q2 2026.

2. **Smart Contract Risk:** Smart contracts are experimental technology. Bugs may exist despite extensive testing.

3. **No Guarantees:** Revenue bonds do NOT guarantee returns. Protocol revenue may vary or cease entirely.

4. **Do Your Research:** Always verify contract addresses and understand risks before interacting.

5. **Not Financial Advice:** This documentation is for informational purposes only.

---

**Last Updated:** March 16, 2026  
**Version:** 2.0  
**Network:** Arbitrum One (ChainID: 42161)

**Official Repository:** https://github.com/EquorumProtocol/Equorum-Revenue-Bonds
