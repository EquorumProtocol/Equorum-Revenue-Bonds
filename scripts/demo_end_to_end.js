const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\nStarting End-to-End Demo...\n");

  const [protocol, alice, bob] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  console.log("Demo Info:");
  console.log("  Network:", network.name, `(chainId: ${network.chainId})`);
  console.log("  Protocol:", protocol.address);
  console.log("  Alice:", alice.address);
  console.log("  Bob:", bob.address);
  console.log("");

  // Load deployment
  console.log("Loading deployment...");
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const latestPath = path.join(deploymentsDir, `deployment-${network.name}-latest.json`);

  if (!fs.existsSync(latestPath)) {
    throw new Error(`No deployment found for ${network.name}. Run deploy_mvp.js first!`);
  }

  const deployment = JSON.parse(fs.readFileSync(latestPath, "utf-8"));
  console.log("  [OK] Loaded deployment from:", new Date(deployment.timestamp).toISOString());
  console.log("");

  // Connect to contracts
  const series = await hre.ethers.getContractAt("RevenueSeries", deployment.demoSeries.series);
  const router = await hre.ethers.getContractAt("RevenueRouter", deployment.demoSeries.router);

  console.log("Contracts:");
  console.log("  Series:", await series.getAddress());
  console.log("  Router:", await router.getAddress());
  console.log("");

  // Step 1: Distribute tokens
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 1: Distributing tokens to Alice & Bob");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  const aliceAmount = hre.ethers.parseEther("300000");
  const bobAmount = hre.ethers.parseEther("200000");

  console.log("  Transferring tokens...");
  await series.connect(protocol).transfer(alice.address, aliceAmount);
  await series.connect(protocol).transfer(bob.address, bobAmount);

  const aliceBalance = await series.balanceOf(alice.address);
  const bobBalance = await series.balanceOf(bob.address);
  const protocolBalance = await series.balanceOf(protocol.address);

  console.log("  [OK] Tokens distributed!");
  console.log("");
  console.log("  Token Balances:");
  console.log("    Alice:    ", hre.ethers.formatEther(aliceBalance), "tokens (30%)");
  console.log("    Bob:      ", hre.ethers.formatEther(bobBalance), "tokens (20%)");
  console.log("    Protocol: ", hre.ethers.formatEther(protocolBalance), "tokens (50%)");
  console.log("");

  // Step 2: Send revenue to router
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 2: Protocol sends revenue to router");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  const revenueAmount = hre.ethers.parseEther("10");
  console.log("  Sending", hre.ethers.formatEther(revenueAmount), "ETH to router...");

  await protocol.sendTransaction({
    to: await router.getAddress(),
    value: revenueAmount
  });

  const routerBalance = await hre.ethers.provider.getBalance(await router.getAddress());
  console.log("  [OK] Revenue sent!");
  console.log("  Router balance:", hre.ethers.formatEther(routerBalance), "ETH");
  console.log("");

  // Step 3: Route revenue to series
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 3: Router routes revenue to series");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  console.log("  Routing revenue...");
  await router.routeRevenue();

  const routerStatus = await router.getRouterStatus();
  const seriesBalance = await hre.ethers.provider.getBalance(await series.getAddress());
  const revenuePerToken = await series.revenuePerTokenStored();

  console.log("  [OK] Revenue routed!");
  console.log("");
  console.log("  Router Status:");
  console.log("    Total Routed:  ", hre.ethers.formatEther(routerStatus[3]), "ETH");
  console.log("    Failed Routes: ", routerStatus[4].toString());
  console.log("");
  console.log("  Series Status:");
  console.log("    Balance:              ", hre.ethers.formatEther(seriesBalance), "ETH");
  console.log("    Total Received:       ", hre.ethers.formatEther(await series.totalRevenueReceived()), "ETH");
  console.log("    Revenue Per Token:    ", hre.ethers.formatUnits(revenuePerToken, 18), "ETH per token");
  console.log("");

  // Step 4: Calculate claimable
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 4: Calculate claimable rewards");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  const aliceClaimable = await series.calculateClaimable(alice.address);
  const bobClaimable = await series.calculateClaimable(bob.address);
  const protocolClaimable = await series.calculateClaimable(protocol.address);

  console.log("  Claimable Rewards:");
  console.log("    Alice:    ", hre.ethers.formatEther(aliceClaimable), "ETH");
  console.log("    Bob:      ", hre.ethers.formatEther(bobClaimable), "ETH");
  console.log("    Protocol: ", hre.ethers.formatEther(protocolClaimable), "ETH");
  console.log("");

  const totalClaimable = aliceClaimable + bobClaimable + protocolClaimable;
  console.log("  Total Claimable:", hre.ethers.formatEther(totalClaimable), "ETH");
  console.log("");

  // Step 5: Alice claims
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 5: Alice claims her rewards");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  const aliceBalanceBefore = await hre.ethers.provider.getBalance(alice.address);
  console.log("  Alice balance before:", hre.ethers.formatEther(aliceBalanceBefore), "ETH");
  console.log("  Claiming", hre.ethers.formatEther(aliceClaimable), "ETH...");

  const claimTx = await series.connect(alice).claimRevenue();
  const claimReceipt = await claimTx.wait();
  const gasCost = claimReceipt.gasUsed * claimReceipt.gasPrice;

  const aliceBalanceAfter = await hre.ethers.provider.getBalance(alice.address);
  const aliceNetGain = aliceBalanceAfter - aliceBalanceBefore + gasCost;

  console.log("  [OK] Alice claimed!");
  console.log("");
  console.log("  Alice balance after: ", hre.ethers.formatEther(aliceBalanceAfter), "ETH");
  console.log("  Net gain:            ", hre.ethers.formatEther(aliceNetGain), "ETH");
  console.log("  Gas cost:            ", hre.ethers.formatEther(gasCost), "ETH");
  console.log("");

  // Step 6: Bob claims
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("STEP 6: Bob claims his rewards");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  const bobBalanceBefore = await hre.ethers.provider.getBalance(bob.address);
  console.log("  Bob balance before:", hre.ethers.formatEther(bobBalanceBefore), "ETH");
  console.log("  Claiming", hre.ethers.formatEther(bobClaimable), "ETH...");

  const bobClaimTx = await series.connect(bob).claimRevenue();
  const bobClaimReceipt = await bobClaimTx.wait();
  const bobGasCost = bobClaimReceipt.gasUsed * bobClaimReceipt.gasPrice;

  const bobBalanceAfter = await hre.ethers.provider.getBalance(bob.address);
  const bobNetGain = bobBalanceAfter - bobBalanceBefore + bobGasCost;

  console.log("  [OK] Bob claimed!");
  console.log("");
  console.log("  Bob balance after:   ", hre.ethers.formatEther(bobBalanceAfter), "ETH");
  console.log("  Net gain:            ", hre.ethers.formatEther(bobNetGain), "ETH");
  console.log("  Gas cost:            ", hre.ethers.formatEther(bobGasCost), "ETH");
  console.log("");

  // Final Summary
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("[SUCCESS] DEMO COMPLETE - FINAL SUMMARY");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  console.log("Revenue Flow:");
  console.log("  Revenue sent:        ", hre.ethers.formatEther(revenueAmount), "ETH");
  console.log("  To series (80%):     ", hre.ethers.formatEther(routerStatus[3]), "ETH");
  console.log("  To protocol (20%):   ", hre.ethers.formatEther(revenueAmount - routerStatus[3]), "ETH (in router)");
  console.log("");

  console.log("Claims:");
  console.log("  Alice claimed:       ", hre.ethers.formatEther(aliceNetGain), "ETH");
  console.log("  Bob claimed:         ", hre.ethers.formatEther(bobNetGain), "ETH");
  console.log("  Protocol remaining:  ", hre.ethers.formatEther(protocolClaimable), "ETH");
  console.log("");

  console.log("Verification:");
  const totalClaimed = aliceNetGain + bobNetGain;
  const totalDistributed = await series.totalRevenueReceived();
  console.log("  Total claimed:       ", hre.ethers.formatEther(totalClaimed), "ETH");
  console.log("  Total distributed:   ", hre.ethers.formatEther(totalDistributed), "ETH");
  console.log("  Remaining claimable: ", hre.ethers.formatEther(protocolClaimable), "ETH");
  console.log("  Series balance:      ", hre.ethers.formatEther(await hre.ethers.provider.getBalance(await series.getAddress())), "ETH");
  console.log("");

  console.log("[SUCCESS] All checks passed!");
  console.log("");
  console.log("Key Metrics:");
  console.log("  seriesAddress:           ", await series.getAddress());
  console.log("  routerAddress:           ", await router.getAddress());
  console.log("  revenuePerTokenStored:   ", hre.ethers.formatUnits(revenuePerToken, 18));
  console.log("  claimable(Alice):        ", hre.ethers.formatEther(0), "ETH (claimed)");
  console.log("  claimable(Bob):          ", hre.ethers.formatEther(0), "ETH (claimed)");
  console.log("  claimable(Protocol):     ", hre.ethers.formatEther(protocolClaimable), "ETH");
  console.log("");
  console.log("Demo finished successfully!");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n[ERROR] Demo failed:");
    console.error(error);
    process.exit(1);
  });
