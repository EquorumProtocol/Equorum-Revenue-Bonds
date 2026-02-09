const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
    console.log("\n=== Creating GENESIS Revenue Series ===\n");

    // Factory address on Arbitrum One
    const FACTORY_ADDRESS = "0x8afA0318363FfBc29Cc28B3C98d9139C08Af737b";
    
    // Genesis series parameters - Historic first series
    const SERIES_NAME = "Revenue Bonds Genesis - Built for the underdogs";
    const SERIES_SYMBOL = "UNDERDOG-RB";
    const REVENUE_SHARE_BPS = 2000; // 20%
    const DURATION_DAYS = 180; // 6 months
    const TOTAL_SUPPLY = ethers.parseEther("100000"); // 100k tokens
    const ROUTER_ADDRESS = ethers.ZeroAddress; // No router

    console.log("Parameters:");
    console.log("- Name:", SERIES_NAME);
    console.log("- Symbol:", SERIES_SYMBOL);
    console.log("- Revenue Share:", REVENUE_SHARE_BPS / 100, "%");
    console.log("- Duration:", DURATION_DAYS, "days");
    console.log("- Total Supply:", ethers.formatEther(TOTAL_SUPPLY), "tokens");
    console.log("- Router:", ROUTER_ADDRESS === ethers.ZeroAddress ? "None" : ROUTER_ADDRESS);
    console.log();

    // Get signer
    const [signer] = await ethers.getSigners();
    console.log("Signer:", signer.address);
    
    // Check balance
    const balance = await ethers.provider.getBalance(signer.address);
    console.log("Balance:", ethers.formatEther(balance), "ETH");
    console.log();

    // Get factory contract
    const factory = await ethers.getContractAt("RevenueSeriesFactory", FACTORY_ADDRESS);
    
    // Check if fees are enabled
    const feeConfig = await factory.getFeeConfig();
    console.log("Fee Status:");
    console.log("- Enabled:", feeConfig.enabled);
    console.log("- Amount:", feeConfig.amount ? ethers.formatEther(feeConfig.amount) : "0", "ETH");
    console.log();

    // Create series
    console.log("Creating series...");
    const tx = await factory.createSeries(
        SERIES_NAME,
        SERIES_SYMBOL,
        signer.address, // protocol address
        REVENUE_SHARE_BPS,
        DURATION_DAYS,
        TOTAL_SUPPLY,
        { value: feeConfig.enabled ? feeConfig.amount : 0 }
    );

    console.log("Transaction hash:", tx.hash);
    console.log("Waiting for confirmation...");
    
    const receipt = await tx.wait();
    console.log("✅ Transaction confirmed!");
    console.log("Block:", receipt.blockNumber);
    console.log("Gas used:", receipt.gasUsed.toString());
    console.log();

    // Extract series address from event
    const seriesCreatedEvent = receipt.logs.find(
        log => {
            try {
                const parsed = factory.interface.parseLog(log);
                return parsed.name === "SeriesCreated";
            } catch {
                return false;
            }
        }
    );

    if (seriesCreatedEvent) {
        const parsed = factory.interface.parseLog(seriesCreatedEvent);
        const seriesAddress = parsed.args.series;
        const routerAddress = parsed.args.router;
        
        console.log("=== Series Created Successfully! ===");
        console.log();
        console.log("Series Address:", seriesAddress);
        console.log("Router Address:", routerAddress);
        console.log();
        console.log("View on Arbiscan:");
        console.log("- Series:", `https://arbiscan.io/address/${seriesAddress}`);
        if (routerAddress !== ethers.ZeroAddress) {
            console.log("- Router:", `https://arbiscan.io/address/${routerAddress}`);
        }
        console.log();
        console.log("Next steps:");
        console.log("1. Verify contracts on Arbiscan");
        console.log("2. Check token balance in your wallet");
        console.log("3. Decide distribution strategy (Uniswap, OTC, Airdrop)");
        console.log("4. Test revenue distribution");
    } else {
        console.log("⚠️ Could not find SeriesCreated event in transaction logs");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
