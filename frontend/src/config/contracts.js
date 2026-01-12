// Contract ABIs and addresses
// These will be updated after deployment

export const FACTORY_ABI = [
  {
    "inputs": [],
    "name": "getAllSeries",
    "outputs": [{ "internalType": "address[]", "name": "", "type": "address[]" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "string", "name": "name", "type": "string" },
      { "internalType": "string", "name": "symbol", "type": "string" },
      { "internalType": "address", "name": "protocol", "type": "address" },
      { "internalType": "uint256", "name": "revenueShareBPS", "type": "uint256" },
      { "internalType": "uint256", "name": "durationDays", "type": "uint256" },
      { "internalType": "uint256", "name": "totalSupply", "type": "uint256" }
    ],
    "name": "createSeries",
    "outputs": [
      { "internalType": "address", "name": "series", "type": "address" },
      { "internalType": "address", "name": "router", "type": "address" }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "series", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "router", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "protocol", "type": "address" },
      { "indexed": false, "internalType": "string", "name": "name", "type": "string" },
      { "indexed": false, "internalType": "string", "name": "symbol", "type": "string" }
    ],
    "name": "SeriesCreated",
    "type": "event"
  }
];

export const SERIES_ABI = [
  {
    "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "user", "type": "address" }],
    "name": "calculateClaimable",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "claimRevenue",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getSeriesInfo",
    "outputs": [
      { "internalType": "address", "name": "protocolAddress", "type": "address" },
      { "internalType": "uint256", "name": "revenueBPS", "type": "uint256" },
      { "internalType": "uint256", "name": "maturity", "type": "uint256" },
      { "internalType": "uint256", "name": "totalRevenue", "type": "uint256" },
      { "internalType": "uint256", "name": "revenuePerToken", "type": "uint256" },
      { "internalType": "bool", "name": "isActive", "type": "bool" },
      { "internalType": "uint256", "name": "timeRemaining", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "router",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "name",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "symbol",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalSupply",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "revenuePerTokenStored",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalRevenueReceived",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "user", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "RevenueClaimed",
    "type": "event"
  }
];

export const ROUTER_ABI = [
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "sender", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
    ],
    "name": "RevenueReceived",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "toSeries", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "toProtocol", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
    ],
    "name": "RevenueRouted",
    "type": "event"
  }
];

// Contract addresses by network
export const FACTORY_ADDRESSES = {
  42161: '0x8afA0318363FfBc29Cc28B3C98d9139C08Af737b',  // Arbitrum One (Mainnet)
  421614: '0x2B2b7DC0b8276b74dEb57bB30b7AA66697DF7dA8'  // Arbitrum Sepolia (Testnet)
};

// Get factory address for current chain
export function getFactoryAddress(chainId) {
  return FACTORY_ADDRESSES[chainId] || FACTORY_ADDRESSES[42161]; // Default to mainnet
}

// Legacy export for backward compatibility (defaults to mainnet)
export const FACTORY_ADDRESS = FACTORY_ADDRESSES[42161];
