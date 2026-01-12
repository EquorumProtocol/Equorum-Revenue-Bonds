const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Helper function to save deployment info
async function saveDeployment(chainId, factoryAddress, seriesAddress, routerAddress, seriesConfig = null) {
  const deployment = {
    chainId: chainId.toString(),
    network: chainId === 42161n ? "arbitrum-one" : chainId === 421614n ? "arbitrum-sepolia" : "unknown",
    timestamp: new Date().toISOString(),
    factory: factoryAddress,
    ...(seriesAddress && {
      demoSeries: {
        series: seriesAddress,
        router: routerAddress,
        ...(seriesConfig && {
          name: seriesConfig.name,
          symbol: seriesConfig.symbol,
          protocol: seriesConfig.protocol,
          revenueShareBPS: seriesConfig.revenueShareBPS,
          durationDays: seriesConfig.durationDays,
          totalSupply: hre.ethers.formatEther(seriesConfig.totalSupply)
        })
      }
    })
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const networkName = deployment.network;
  const filename = `deployment-${networkName}-${Date.now()}.json`;
  const filepath = path.join(deploymentsDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(deployment, null, 2));

  const latestPath = path.join(deploymentsDir, `deployment-${networkName}-latest.json`);
  fs.writeFileSync(latestPath, JSON.stringify(deployment, null, 2));

  console.log("\n[SAVE] Deployment info saved to:", filename);
}

// Helper function to print deployment summary
async function printSummary(network, factoryAddress, seriesAddress, routerAddress, treasuryAddress, seriesConfig = null) {
  const explorerBase = network.chainId === 421614n 
    ? "https://sepolia.arbiscan.io" 
    : network.chainId === 42161n
    ? "https://arbiscan.io"
    : "https://arbiscan.io";
  
  console.log("\n========================================");
  console.log("DEPLOYMENT SUMMARY");
  console.log("========================================\n");
  
  console.log("Network:", network.name, `(chainId: ${network.chainId})`);
  console.log("Timestamp:", new Date().toISOString());
  console.log("");
  
  console.log("Contract Addresses:");
  console.log("  Factory:", factoryAddress);
  if (seriesAddress) {
    console.log("  Demo Series:", seriesAddress);
    console.log("  Demo Router:", routerAddress);
  }
  console.log("  Treasury:", treasuryAddress);
  console.log("");
  
  if (seriesConfig) {
    console.log("Series Configuration:");
    console.log("  Name:", seriesConfig.name);
    console.log("  Symbol:", seriesConfig.symbol);
    console.log("  Revenue Share:", seriesConfig.revenueShareBPS / 100, "%");
    console.log("  Duration:", seriesConfig.durationDays, "days");
    console.log("  Total Supply:", hre.ethers.formatEther(seriesConfig.totalSupply), "tokens");
    console.log("");
  }
  
  console.log("Block Explorer Links:");
  console.log("  Factory:", explorerBase + "/address/" + factoryAddress);
  if (seriesAddress) {
    console.log("  Series:", explorerBase + "/address/" + seriesAddress);
    console.log("  Router:", explorerBase + "/address/" + routerAddress);
  }
  console.log("");
  
  console.log("Verification Commands:");
  console.log("  npx hardhat verify --network", network.name === "arbitrum-sepolia" ? "arbitrumSepolia" : "arbitrumOne", factoryAddress, `"${treasuryAddress}"`);
  console.log("");
  
  console.log("Next Steps:");
  console.log("  1. Verify contracts on Arbiscan (see commands above)");
  console.log("  2. Transfer Factory ownership to multisig (if mainnet)");
  console.log("  3. Configure fees (if needed): factory.setFees(true, amount)");
  console.log("  4. Test with demo series or integrate with frontend");
  console.log("");
  
  console.log("[SUCCESS] Deployment complete!");
}

async function main() {
  console.log("\n========================================");
  console.log("Revenue Bonds Protocol - Mainnet Deploy");
  console.log("========================================\n");

  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  console.log("[DEPLOY] Network Info:");
  console.log("  Network:", network.name, `(chainId: ${network.chainId})`);
  console.log("  Deployer:", deployer.address);
  console.log("  Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("");

  // Step 1: Deploy Factory
  console.log("[STEP 1/2] Deploying RevenueSeriesFactory...\n");
  
  // Use deployer address as initial treasury (can be changed later via setTreasury)
  const treasuryAddress = process.env.TREASURY_ADDRESS || deployer.address;
  console.log("  Treasury address:", treasuryAddress);
  if (treasuryAddress === deployer.address) {
    console.log("  [WARNING] Using deployer as treasury. Consider using multisig for mainnet.");
  }
  console.log("");
  
  const RevenueSeriesFactory = await hre.ethers.getContractFactory("RevenueSeriesFactory");
  const deployTx = await RevenueSeriesFactory.deploy(treasuryAddress);
  console.log("  Deploy tx hash:", deployTx.deploymentTransaction().hash);
  
  const factory = await deployTx.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  
  const deployReceipt = await deployTx.deploymentTransaction().wait();
  console.log("  Gas used:", deployReceipt.gasUsed.toString());
  console.log("  [SUCCESS] Factory deployed at:", factoryAddress);
  console.log("");
  
  // Display safety limits
  const limits = await factory.getSafetyLimits();
  console.log("  Safety Limits:");
  console.log("    MAX_REVENUE_SHARE_BPS:", limits[0].toString(), "(50%)");
  console.log("    MIN_DURATION_DAYS:", limits[1].toString());
  console.log("    MAX_DURATION_DAYS:", limits[2].toString());
  console.log("    MIN_TOTAL_SUPPLY:", hre.ethers.formatEther(limits[3]), "tokens");
  console.log("");
  
  // Display fee config
  const feeConfig = await factory.getFeeConfig();
  console.log("  Fee Configuration:");
  console.log("    Treasury:", feeConfig[0]);
  console.log("    Creation Fee:", hre.ethers.formatEther(feeConfig[1]), "ETH");
  console.log("    Fees Enabled:", feeConfig[2]);
  console.log("");

  // Step 2: Create Demo Series (optional, skip for mainnet if not needed)
  const createDemo = process.env.CREATE_DEMO_SERIES !== "false";
  
  if (!createDemo) {
    console.log("[STEP 2/2] Skipping demo series creation\n");
    console.log("[SUCCESS] Factory deployment complete!\n");
    await saveDeployment(network.chainId, factoryAddress, null, null);
    await printSummary(network, factoryAddress, null, null, treasuryAddress);
    return;
  }
  
  console.log("[STEP 2/2] Creating Demo Series...\n");
  
  const seriesConfig = {
    name: "Demo Revenue Series",
    symbol: "DEMO-REV",
    protocol: deployer.address,
    revenueShareBPS: 2000,
    durationDays: 365,
    totalSupply: hre.ethers.parseEther("1000000")
  };

  console.log("  Series Configuration:");
  console.log("    Name:", seriesConfig.name);
  console.log("    Symbol:", seriesConfig.symbol);
  console.log("    Protocol:", seriesConfig.protocol);
  console.log("    Revenue Share:", seriesConfig.revenueShareBPS / 100, "%");
  console.log("    Duration:", seriesConfig.durationDays, "days (~", Math.floor(seriesConfig.durationDays / 30), "months)");
  console.log("    Total Supply:", hre.ethers.formatEther(seriesConfig.totalSupply), "tokens");
  console.log("");

  console.log("  Submitting createSeries transaction...");
  const createTx = await factory.createSeries(
    seriesConfig.name,
    seriesConfig.symbol,
    seriesConfig.protocol,
    seriesConfig.revenueShareBPS,
    seriesConfig.durationDays,
    seriesConfig.totalSupply
  );
  
  console.log("  Tx hash:", createTx.hash);
  console.log("  Waiting for confirmation...");
  const receipt = await createTx.wait();
  console.log("  Gas used:", receipt.gasUsed.toString());

  // Get series and router addresses from event
  const seriesCreatedEvent = receipt.logs.find((log) => {
    try {
      const parsed = factory.interface.parseLog(log);
      return parsed?.name === "SeriesCreated";
    } catch {
      return false;
    }
  });

  if (!seriesCreatedEvent) {
    throw new Error("SeriesCreated event not found!");
  }

  const parsedEvent = factory.interface.parseLog(seriesCreatedEvent);
  const seriesAddress = parsedEvent.args[0];
  const routerAddress = parsedEvent.args[1];

  console.log("  [SUCCESS] Series created!");
  console.log("    Series:", seriesAddress);
  console.log("    Router:", routerAddress);
  console.log("");

  // Verify deployment
  console.log("Verifying deployment...");
  const series = await hre.ethers.getContractAt("RevenueSeries", seriesAddress);
  const router = await hre.ethers.getContractAt("RevenueRouter", routerAddress);

  const seriesInfo = await series.getSeriesInfo();
  const routerStatus = await router.getRouterStatus();

  console.log("  Series Info:");
  console.log("    Name:", await series.name());
  console.log("    Symbol:", await series.symbol());
  console.log("    Total Supply:", hre.ethers.formatEther(await series.totalSupply()), "tokens");
  console.log("    Protocol:", seriesInfo[0]);
  console.log("    Router (from contract):", await series.router());
  console.log("    Revenue Share BPS:", seriesInfo[1].toString(), "(" + (Number(seriesInfo[1]) / 100) + "%)");
  console.log("    Maturity Date:", new Date(Number(seriesInfo[2]) * 1000).toISOString());
  
  const timeRemaining = Number(seriesInfo[6]);
  const daysRemaining = (timeRemaining / 86400).toFixed(2);
  console.log("    Time Remaining:", timeRemaining, "seconds (~" + daysRemaining + " days)");
  
  console.log("    Total Revenue Received:", hre.ethers.formatEther(seriesInfo[3]), "ETH");
  console.log("    Active:", seriesInfo[5]);
  console.log("");

  console.log("  Router Status:");
  console.log("    Current Balance:", hre.ethers.formatEther(routerStatus[0]), "ETH");
  console.log("    Total Received:", hre.ethers.formatEther(routerStatus[1]), "ETH");
  console.log("    Total Routed to Series:", hre.ethers.formatEther(routerStatus[2]), "ETH");
  console.log("    Total Returned to Protocol:", hre.ethers.formatEther(routerStatus[3]), "ETH");
  console.log("    Failed Route Attempts:", routerStatus[4].toString());
  console.log("    Revenue Share BPS:", routerStatus[5].toString());
  console.log("    Can Route Now:", routerStatus[6]);
  console.log("");

  // Save and print summary
  await saveDeployment(network.chainId, factoryAddress, seriesAddress, routerAddress, seriesConfig);
  await printSummary(network, factoryAddress, seriesAddress, routerAddress, treasuryAddress, seriesConfig);
  console.log("");
  
  console.log("Next Steps:");
  console.log("  Run demo: npx hardhat run scripts/demo_end_to_end.js");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n[ERROR] Deployment failed:");
    console.error(error);
    process.exit(1);
  });
