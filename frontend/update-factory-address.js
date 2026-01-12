#!/usr/bin/env node

/**
 * Helper script to update factory address in frontend config
 * Usage: node update-factory-address.js <factory_address>
 */

const fs = require('fs');
const path = require('path');

const factoryAddress = process.argv[2];

if (!factoryAddress) {
  console.error('❌ Error: Factory address required');
  console.log('Usage: node update-factory-address.js <factory_address>');
  process.exit(1);
}

if (!factoryAddress.startsWith('0x') || factoryAddress.length !== 42) {
  console.error('❌ Error: Invalid Ethereum address');
  process.exit(1);
}

const configPath = path.join(__dirname, 'src', 'config', 'contracts.js');
let config = fs.readFileSync(configPath, 'utf8');

// Replace the FACTORY_ADDRESS line
config = config.replace(
  /export let FACTORY_ADDRESS = .+;/,
  `export let FACTORY_ADDRESS = '${factoryAddress}';`
);

fs.writeFileSync(configPath, config);

console.log('✅ Factory address updated successfully!');
console.log(`   Address: ${factoryAddress}`);
console.log('\n📝 Next steps:');
console.log('   1. Make sure Hardhat node is running: npx hardhat node');
console.log('   2. Start frontend: npm run dev');
console.log('   3. Connect MetaMask to localhost:8545 (Chain ID 31337)');
