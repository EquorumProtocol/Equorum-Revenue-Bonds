# Frontend Setup Guide

## Quick Start

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Configure Factory Address

After deploying contracts locally, update the factory address:

```bash
# Edit src/config/contracts.js
# Set FACTORY_ADDRESS to your deployed factory address
```

Or use the helper script:

```javascript
// In browser console after deployment
import { setFactoryAddress } from './config/contracts';
setFactoryAddress('0xYourFactoryAddress');
```

### 3. Start Hardhat Node

In the root project directory:
```bash
npx hardhat node
```

### 4. Deploy Contracts

In another terminal:
```bash
npx hardhat run scripts/full_demo.js --network localhost
```

Copy the Factory address from the output.

### 5. Update Frontend Config

Edit `src/config/contracts.js` and replace:
```javascript
export let FACTORY_ADDRESS = null;
```

With:
```javascript
export let FACTORY_ADDRESS = '0xYourFactoryAddressHere';
```

### 6. Run Frontend

```bash
npm run dev
```

Open http://localhost:5173

### 7. Connect MetaMask

1. Add Hardhat network to MetaMask:
   - Network Name: Hardhat Local
   - RPC URL: http://127.0.0.1:8545
   - Chain ID: 31337
   - Currency: ETH

2. Import one of the Hardhat test accounts:
   - Use private key from `npx hardhat node` output
   - Account #0 is the deployer (has the demo tokens)

## Features

### V1 (Current)
- ✅ Connect wallet
- ✅ View all series where user has balance
- ✅ Display claimable amount per series
- ✅ Claim revenue with one click
- ✅ Series details page
- ✅ Contract links to Arbiscan

### Coming Soon (V2)
- Batch claim (claim from multiple series at once)
- USD price estimates
- Revenue history charts
- Notifications

## Architecture

```
frontend/
├── src/
│   ├── config/
│   │   ├── wagmi.js          # Web3 configuration
│   │   └── contracts.js      # ABIs and addresses
│   ├── hooks/
│   │   ├── useAllSeries.js   # Fetch all series from factory
│   │   └── useUserHoldings.js # Filter user's holdings
│   ├── components/
│   │   ├── ConnectButton.jsx
│   │   ├── HoldingCard.jsx
│   │   └── ClaimButton.jsx
│   └── pages/
│       ├── MyRevenue.jsx     # Main page
│       └── SeriesDetails.jsx # Series details
```

## Troubleshooting

### "No holdings found"
- Make sure you deployed contracts with `full_demo.js`
- Verify FACTORY_ADDRESS is set correctly
- Check that you're connected with the deployer account (Account #0)

### "Cannot read properties of null"
- Factory address not set in `contracts.js`
- Run deployment script first

### MetaMask shows wrong network
- Switch to Hardhat Local (Chain ID 31337)
- Make sure Hardhat node is running

### Transactions failing
- Check Hardhat node is running
- Verify you have ETH in your account
- Try resetting MetaMask account (Settings > Advanced > Reset Account)

## Development

### Hot Reload
The frontend uses Vite with hot module replacement. Changes are reflected instantly.

### Adding New Features

1. **New Hook**: Add to `src/hooks/`
2. **New Component**: Add to `src/components/`
3. **New Page**: Add to `src/pages/` and update routes in `App.jsx`

### Styling
Uses TailwindCSS. Utility classes are defined in `tailwind.config.js`.

## Production Build

```bash
npm run build
```

Output in `dist/` directory.

## Next Steps

1. Test with multiple accounts
2. Test claim functionality
3. Verify series details page
4. Deploy to testnet
5. Update RPC URL and chain in `wagmi.js`
