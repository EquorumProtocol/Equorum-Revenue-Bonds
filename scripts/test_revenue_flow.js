const hre = require("hardhat");

async function main() {
  console.log("\nTesting Revenue Bonds Protocol - End to End Flow\n");

  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  console.log("Test Info:");
  console.log("  Network:", network.name, `(chainId: ${network.chainId})`);
  console.log("  Tester:", deployer.address);
  console.log("");

  // Arbitrum Sepolia deployment addresses
  const seriesAddress = "0xb42751FFBCFbe76dd5Fc919088B2a81B52C48D19";
  const routerAddress = "0x3D170736435F9D2e3eC7164dA56EC1DE0dd24A5F";

  console.log("Contract Addresses:");
  console.log("  Series:", seriesAddress);
  console.log("  Router:", routerAddress);
  console.log("");

  // Get contract instances
  const series = await hre.ethers.getContractAt("RevenueSeries", seriesAddress);
  const router = await hre.ethers.getContractAt("RevenueRouter", routerAddress);

  // ============================================
  // STEP 1: Check Initial State
  // ============================================
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 1: Initial State");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  const balance = await series.balanceOf(deployer.address);
  const claimableBefore = await series.calculateClaimable(deployer.address);
  const totalRevenueBefore = await series.totalRevenueReceived();
  
  console.log("  Your token balance:", hre.ethers.formatEther(balance), "tokens");
  console.log("  Claimable revenue:", hre.ethers.formatEther(claimableBefore), "ETH");
  console.log("  Total revenue received:", hre.ethers.formatEther(totalRevenueBefore), "ETH");
  console.log("");

  // ============================================
  // STEP 2: Send Revenue to Router
  // ============================================
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 2: Sending Revenue to Router");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  const revenueAmount = hre.ethers.parseEther("0.01"); // 0.01 ETH
  console.log("  Sending", hre.ethers.formatEther(revenueAmount), "ETH to router...");
  
  const tx1 = await deployer.sendTransaction({
    to: routerAddress,
    value: revenueAmount
  });
  
  console.log("  Transaction hash:", tx1.hash);
  await tx1.wait();
  console.log("  [SUCCESS] Revenue sent to router");
  console.log("");

  // ============================================
  // STEP 3: Route Revenue to Series
  // ============================================
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 3: Routing Revenue to Series");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  console.log("  Calling router.routeRevenue()...");
  const tx2 = await router.routeRevenue();
  console.log("  Transaction hash:", tx2.hash);
  
  const receipt = await tx2.wait();
  console.log("  [SUCCESS] Revenue routed successfully");
  console.log("");

  // Check router status
  const routerStatus = await router.getRouterStatus();
  const revenueShareBPS = await router.revenueShareBPS();
  const expectedToSeries = (revenueAmount * revenueShareBPS) / 10000n;
  const expectedToProtocol = revenueAmount - expectedToSeries;
  
  console.log("  Router Status:");
  console.log("    Total Received:", hre.ethers.formatEther(routerStatus[1]), "ETH");
  console.log("    Routed to Series:", hre.ethers.formatEther(routerStatus[2]), "ETH");
  console.log("    Returned to Protocol:", hre.ethers.formatEther(routerStatus[3]), "ETH");
  console.log("");
  console.log("  Expected Distribution (20% to series, 80% to protocol):");
  console.log("    To Series:", hre.ethers.formatEther(expectedToSeries), "ETH");
  console.log("    To Protocol:", hre.ethers.formatEther(expectedToProtocol), "ETH");
  console.log("");

  // ============================================
  // STEP 4: Check Claimable Revenue
  // ============================================
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 4: Checking Claimable Revenue");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  const claimableAfter = await series.calculateClaimable(deployer.address);
  const totalRevenueAfter = await series.totalRevenueReceived();
  
  console.log("  Total revenue received by series:", hre.ethers.formatEther(totalRevenueAfter), "ETH");
  console.log("  Your claimable revenue:", hre.ethers.formatEther(claimableAfter), "ETH");
  console.log("");

  if (claimableAfter > 0n) {
    console.log("  [SUCCESS] You have revenue to claim!");
  } else {
    console.log("  [WARNING] No revenue to claim yet");
  }
  console.log("");

  // ============================================
  // STEP 5: Claim Revenue
  // ============================================
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 5: Claiming Revenue");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  if (claimableAfter > 0n) {
    const ethBalanceBefore = await hre.ethers.provider.getBalance(deployer.address);
    console.log("  ETH balance before claim:", hre.ethers.formatEther(ethBalanceBefore), "ETH");
    
    console.log("  Claiming", hre.ethers.formatEther(claimableAfter), "ETH...");
    const tx3 = await series.claimRevenue();
    console.log("  Transaction hash:", tx3.hash);
    
    const claimReceipt = await tx3.wait();
    const gasCost = claimReceipt.gasUsed * claimReceipt.gasPrice;
    
    const ethBalanceAfter = await hre.ethers.provider.getBalance(deployer.address);
    const netGain = ethBalanceAfter - ethBalanceBefore;
    
    console.log("  [SUCCESS] Revenue claimed successfully!");
    console.log("");
    console.log("  ETH balance after claim:", hre.ethers.formatEther(ethBalanceAfter), "ETH");
    console.log("  Gas cost:", hre.ethers.formatEther(gasCost), "ETH");
    console.log("  Net gain:", hre.ethers.formatEther(netGain), "ETH");
    console.log("");
  } else {
    console.log("  [WARNING] Skipping claim (no revenue available)");
    console.log("");
  }

  // ============================================
  // STEP 6: Final State
  // ============================================
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 6: Final State");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  const claimableFinal = await series.calculateClaimable(deployer.address);
  const totalRevenueFinal = await series.totalRevenueReceived();
  
  console.log("  Your token balance:", hre.ethers.formatEther(balance), "tokens");
  console.log("  Total revenue received:", hre.ethers.formatEther(totalRevenueFinal), "ETH");
  console.log("  Claimable revenue:", hre.ethers.formatEther(claimableFinal), "ETH");
  console.log("");

  // ============================================
  // Summary
  // ============================================
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TEST COMPLETE!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("Summary:");
  console.log("  [SUCCESS] Revenue sent to router:", hre.ethers.formatEther(revenueAmount), "ETH");
  console.log("  [SUCCESS] Revenue distributed to series:", hre.ethers.formatEther(totalRevenueFinal), "ETH");
  console.log("  [SUCCESS] Revenue claimed:", hre.ethers.formatEther(claimableAfter - claimableFinal), "ETH");
  console.log("");
  console.log("Next Steps:");
  console.log("  1. Refresh the frontend (http://localhost:5174)");
  console.log("  2. You should now see claimable revenue!");
  console.log("  3. Try claiming from the UI");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n[ERROR] Test failed:");
    console.error(error);
    process.exit(1);
  });
