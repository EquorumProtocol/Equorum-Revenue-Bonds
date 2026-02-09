#!/bin/bash

# ============================================
# EQUORUM PROTOCOL SUBGRAPH - SETUP SCRIPT
# ============================================
# Este script automatiza o setup inicial do subgraph

set -e

echo "🚀 Equorum Protocol Subgraph Setup"
echo "===================================="
echo ""

# Check if we're in the right directory
if [ ! -f "schema.graphql" ]; then
    echo "❌ Error: schema.graphql not found. Please run this script from the subgraph directory."
    exit 1
fi

# Step 1: Install dependencies
echo "📦 Step 1: Installing dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Step 2: Create abis directory
echo "📁 Step 2: Creating ABIs directory..."
mkdir -p abis
echo "✅ ABIs directory created"
echo ""

# Step 3: Copy ABIs from compiled contracts
echo "📋 Step 3: Copying contract ABIs..."

# Check if artifacts exist
if [ ! -d "../artifacts/contracts/v2" ]; then
    echo "⚠️  Warning: Compiled contracts not found. Please run 'npx hardhat compile' first."
    echo "   Skipping ABI copy step..."
else
    # Copy Factory ABI
    if [ -f "../artifacts/contracts/v2/core/RevenueSeriesFactory.sol/RevenueSeriesFactory.json" ]; then
        cp "../artifacts/contracts/v2/core/RevenueSeriesFactory.sol/RevenueSeriesFactory.json" abis/
        echo "   ✓ RevenueSeriesFactory.json"
    fi

    # Copy RevenueSeries ABI
    if [ -f "../artifacts/contracts/v2/core/RevenueSeries.sol/RevenueSeries.json" ]; then
        cp "../artifacts/contracts/v2/core/RevenueSeries.sol/RevenueSeries.json" abis/
        echo "   ✓ RevenueSeries.json"
    fi

    # Copy RevenueBondEscrow ABI
    if [ -f "../artifacts/contracts/v2/core/RevenueBondEscrow.sol/RevenueBondEscrow.json" ]; then
        cp "../artifacts/contracts/v2/core/RevenueBondEscrow.sol/RevenueBondEscrow.json" abis/
        echo "   ✓ RevenueBondEscrow.json"
    fi

    # Copy RevenueRouter ABI
    if [ -f "../artifacts/contracts/v2/core/RevenueRouter.sol/RevenueRouter.json" ]; then
        cp "../artifacts/contracts/v2/core/RevenueRouter.sol/RevenueRouter.json" abis/
        echo "   ✓ RevenueRouter.json"
    fi

    # Copy ProtocolReputationRegistry ABI
    if [ -f "../artifacts/contracts/v2/registry/ProtocolReputationRegistry.sol/ProtocolReputationRegistry.json" ]; then
        cp "../artifacts/contracts/v2/registry/ProtocolReputationRegistry.sol/ProtocolReputationRegistry.json" abis/
        echo "   ✓ ProtocolReputationRegistry.json"
    fi

    echo "✅ ABIs copied"
fi
echo ""

# Step 4: Generate code
echo "🔨 Step 4: Generating TypeScript code from schema and ABIs..."
npm run codegen
echo "✅ Code generated"
echo ""

# Step 5: Build subgraph
echo "🏗️  Step 5: Building subgraph..."
npm run build
echo "✅ Subgraph built successfully"
echo ""

echo "============================================"
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Create a subgraph on The Graph Studio: https://thegraph.com/studio/"
echo "2. Get your deploy key"
echo "3. Run: graph auth --studio <DEPLOY_KEY>"
echo "4. Run: npm run deploy"
echo ""
echo "Or for local testing:"
echo "1. Start Graph Node: docker-compose up -d"
echo "2. Run: npm run create-local"
echo "3. Run: npm run deploy-local"
echo "============================================"
