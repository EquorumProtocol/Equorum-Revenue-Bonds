const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("\n=== DEPLOYING REVENUE BONDS V2 TO ARBITRUM SEPOLIA ===\n");

    const [deployer] = await hre.ethers.getSigners();
    const network = await hre.ethers.provider.getNetwork();
    
    console.log("Deployer:", deployer.address);
    console.log("Network:", network.name, "(chainId:", network.chainId, ")\n");

    // Configuration
    const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || deployer.address;
    const FEES_ENABLED = false; // Disabled for testnet
    
    console.log("Configuration:");
    console.log("- Treasury:", TREASURY_ADDRESS);
    console.log("- Fees:", FEES_ENABLED ? "Enabled" : "Disabled");
    console.log("");

    // ============================================
    // 1. DEPLOY REPUTATION REGISTRY
    // ============================================
    console.log("📋 [1/2] Deploying ProtocolReputationRegistry...");
    
    const ProtocolReputationRegistry = await hre.ethers.getContractFactory("ProtocolReputationRegistry");
    const reputationRegistry = await ProtocolReputationRegistry.deploy();
    await reputationRegistry.waitForDeployment();
    
    const repRegistryAddress = await reputationRegistry.getAddress();
    console.log("✅ ProtocolReputationRegistry:", repRegistryAddress);

    // ============================================
    // 2. DEPLOY FACTORY
    // ============================================
    console.log("\n🏭 [2/2] Deploying RevenueSeriesFactory...");
    
    const RevenueSeriesFactory = await hre.ethers.getContractFactory("RevenueSeriesFactory");
    const factory = await RevenueSeriesFactory.deploy(
        TREASURY_ADDRESS,
        repRegistryAddress
    );
    await factory.waitForDeployment();
    
    const factoryAddress = await factory.getAddress();
    console.log("✅ RevenueSeriesFactory:", factoryAddress);

    // ============================================
    // 3. CONFIGURE
    // ============================================
    console.log("\n⚙️  Configuring...");
    
    console.log("- Authorizing Factory in ReputationRegistry...");
    const authTx = await reputationRegistry.authorizeReporter(factoryAddress);
    await authTx.wait();
    console.log("  ✅ Done");

    // ============================================
    // 4. SAVE DEPLOYMENT
    // ============================================
    const deploymentInfo = {
        network: network.name,
        chainId: network.chainId.toString(),
        timestamp: new Date().toISOString(),
        deployer: deployer.address,
        contracts: {
            reputationRegistry: repRegistryAddress,
            factory: factoryAddress
        },
        configuration: {
            treasury: TREASURY_ADDRESS,
            feesEnabled: FEES_ENABLED
        }
    };

    const deploymentsDir = path.join(__dirname, "../deployments/arbitrum-sepolia");
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    
    fs.writeFileSync(
        path.join(deploymentsDir, "v2-deployment.json"),
        JSON.stringify(deploymentInfo, null, 2)
    );

    // ============================================
    // 5. SUMMARY
    // ============================================
    console.log("\n" + "=".repeat(60));
    console.log("🎉 V2 DEPLOYMENT COMPLETE!");
    console.log("=".repeat(60));
    console.log("\n📝 Contract Addresses:");
    console.log("   ReputationRegistry:", repRegistryAddress);
    console.log("   Factory:", factoryAddress);
    console.log("\n🔗 Arbiscan Sepolia:");
    console.log("   https://sepolia.arbiscan.io/address/" + factoryAddress);
    console.log("\n💾 Deployment saved to: deployments/arbitrum-sepolia/v2-deployment.json");
    console.log("");

    return { reputationRegistry: repRegistryAddress, factory: factoryAddress };
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Deployment failed:", error);
        process.exit(1);
    });
