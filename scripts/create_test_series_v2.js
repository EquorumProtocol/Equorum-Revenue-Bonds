// ============================================
// CREATE TEST SERIES V2 - ARBITRUM SEPOLIA
// ============================================
// Create a test Revenue Bond series on V2 testnet

const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
    console.log("\n=== CREATING TEST SERIES ON V2 (TESTNET) ===\n");

    const [deployer] = await hre.ethers.getSigners();
    console.log("Protocol address:", deployer.address);
    console.log("Balance:", hre.ethers.utils.formatEther(await deployer.getBalance()), "ETH\n");

    // Load deployment info
    const deploymentPath = path.join(__dirname, '../deployments/arbitrum-sepolia/v2-deployment.json');
    if (!fs.existsSync(deploymentPath)) {
        throw new Error("V2 deployment not found. Please run deploy_v2_testnet.js first.");
    }
    
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    const FACTORY_ADDRESS = deployment.contracts.factory;
    
    console.log("Using Factory:", FACTORY_ADDRESS);

    // Test series parameters
    const SERIES_NAME = "Test Revenue Bonds V2 - Testnet Demo";
    const SERIES_SYMBOL = "TEST-RB-V2";
    const REVENUE_SHARE_BPS = 2500; // 25%
    const DURATION_DAYS = 180; // 6 months
    const TOTAL_SUPPLY = hre.ethers.utils.parseEther("100000"); // 100,000 tokens

    console.log("\nTest Series Parameters:");
    console.log("- Name:", SERIES_NAME);
    console.log("- Symbol:", SERIES_SYMBOL);
    console.log("- Revenue Share:", REVENUE_SHARE_BPS / 100, "%");
    console.log("- Duration:", DURATION_DAYS, "days");
    console.log("- Total Supply:", hre.ethers.utils.formatEther(TOTAL_SUPPLY), "tokens\n");

    // Get factory contract
    const factory = await hre.ethers.getContractAt("RevenueSeriesFactory", FACTORY_ADDRESS);

    // Check if fees are enabled
    const feesEnabled = await factory.feesEnabled();
    const creationFee = await factory.creationFeeETH();
    
    console.log("Factory Configuration:");
    console.log("- Fees Enabled:", feesEnabled);
    console.log("- Creation Fee:", hre.ethers.utils.formatEther(creationFee), "ETH\n");

    // Create series
    console.log("🚀 Creating test series...");
    
    const tx = await factory.createSoftBond(
        SERIES_NAME,
        SERIES_SYMBOL,
        REVENUE_SHARE_BPS,
        DURATION_DAYS,
        TOTAL_SUPPLY,
        { value: feesEnabled ? creationFee : 0 }
    );

    console.log("Transaction hash:", tx.hash);
    console.log("Waiting for confirmation...");

    const receipt = await tx.wait();
    console.log("✅ Transaction confirmed!");
    console.log("Gas used:", receipt.gasUsed.toString());

    // Get series address from event
    const event = receipt.events.find(e => e.event === 'SeriesCreated');
    const seriesAddress = event.args.series;
    const routerAddress = event.args.router;

    console.log("\n" + "=".repeat(60));
    console.log("🎉 TEST SERIES CREATED!");
    console.log("=".repeat(60));
    console.log("\n📝 Addresses:");
    console.log("   Series:", seriesAddress);
    console.log("   Router:", routerAddress);
    console.log("\n🔗 View on Arbiscan Sepolia:");
    console.log("   Series: https://sepolia.arbiscan.io/address/" + seriesAddress);
    console.log("   Router: https://sepolia.arbiscan.io/address/" + routerAddress);
    console.log("\n💡 Next Steps:");
    console.log("   1. Verify series contract");
    console.log("   2. Test revenue distribution");
    console.log("   3. Test token trading");
    console.log("   4. Test claim functionality");
    console.log("\n");

    // Save test series info
    const testSeriesInfo = {
        network: "arbitrum-sepolia",
        timestamp: new Date().toISOString(),
        factory: FACTORY_ADDRESS,
        series: {
            address: seriesAddress,
            router: routerAddress,
            name: SERIES_NAME,
            symbol: SERIES_SYMBOL,
            revenueShareBPS: REVENUE_SHARE_BPS,
            durationDays: DURATION_DAYS,
            totalSupply: hre.ethers.utils.formatEther(TOTAL_SUPPLY)
        },
        transaction: {
            hash: tx.hash,
            gasUsed: receipt.gasUsed.toString()
        }
    };

    fs.writeFileSync(
        path.join(__dirname, '../deployments/arbitrum-sepolia/test-series-v2.json'),
        JSON.stringify(testSeriesInfo, null, 2)
    );

    console.log("💾 Test series info saved to: deployments/arbitrum-sepolia/test-series-v2.json\n");

    return {
        series: seriesAddress,
        router: routerAddress
    };
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Series creation failed:", error);
        process.exit(1);
    });
