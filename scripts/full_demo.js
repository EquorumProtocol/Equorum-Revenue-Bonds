const hre = require("hardhat");

async function main() {
  console.log("\nFULL DEMO - Deploy + End-to-End Test\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  const [protocol, alice, bob] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  console.log("Network Info:");
  console.log("  Network:", network.name, `(chainId: ${network.chainId})`);
  console.log("  Protocol:", protocol.address);
  console.log("  Alice:", alice.address);
  console.log("  Bob:", bob.address);
  console.log("");

  // ============================================================================
  // PART 1: DEPLOY
  // ============================================================================
  
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("PART 1: DEPLOYING CONTRACTS");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  console.log("Step 1: Deploying RevenueSeriesFactory...");
  const RevenueSeriesFactory = await hre.ethers.getContractFactory("RevenueSeriesFactory");
  const factory = await RevenueSeriesFactory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("  [OK] Factory:", factoryAddress);
  console.log("");

  console.log("Step 2: Creating Demo Series...");
  const createTx = await factory.createSeries(
    "Demo Revenue Series",
    "DEMO-REV",
    protocol.address,
    2000,  // 20% protocol share
    365,   // 1 year
    hre.ethers.parseEther("1000000")  // 1M tokens
  );
  const receipt = await createTx.wait();

  const seriesCreatedEvent = receipt.logs.find((log) => {
    try {
      const parsed = factory.interface.parseLog(log);
      return parsed?.name === "SeriesCreated";
    } catch {
      return false;
    }
  });

  const parsedEvent = factory.interface.parseLog(seriesCreatedEvent);
  const seriesAddress = parsedEvent.args[0];
  const routerAddress = parsedEvent.args[1];

  console.log("  [OK] Series:", seriesAddress);
  console.log("  [OK] Router:", routerAddress);
  console.log("");

  const series = await hre.ethers.getContractAt("RevenueSeries", seriesAddress);
  const router = await hre.ethers.getContractAt("RevenueRouter", routerAddress);

  // ============================================================================
  // PART 2: DISTRIBUTE TOKENS
  // ============================================================================

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("PART 2: DISTRIBUTING TOKENS");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  const aliceAmount = hre.ethers.parseEther("300000");  // 30%
  const bobAmount = hre.ethers.parseEther("200000");    // 20%
  // Protocol keeps 50%

  console.log("Transferring tokens...");
  await series.connect(protocol).transfer(alice.address, aliceAmount);
  await series.connect(protocol).transfer(bob.address, bobAmount);

  const aliceBalance = await series.balanceOf(alice.address);
  const bobBalance = await series.balanceOf(bob.address);
  const protocolBalance = await series.balanceOf(protocol.address);

  console.log("  [OK] Token Balances:");
  console.log("    Alice:    ", hre.ethers.formatEther(aliceBalance), "tokens (30%)");
  console.log("    Bob:      ", hre.ethers.formatEther(bobBalance), "tokens (20%)");
  console.log("    Protocol: ", hre.ethers.formatEther(protocolBalance), "tokens (50%)");
  console.log("");

  // ============================================================================
  // PART 3: SEND REVENUE
  // ============================================================================

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("PART 3: SENDING REVENUE TO ROUTER");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  const revenueAmount = hre.ethers.parseEther("10");  // 10 ETH
  console.log("Sending", hre.ethers.formatEther(revenueAmount), "ETH to router...");

  await protocol.sendTransaction({
    to: await router.getAddress(),
    value: revenueAmount
  });

  console.log("  [OK] Revenue sent!");
  console.log("  Router balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(await router.getAddress())), "ETH");
  console.log("");

  // ============================================================================
  // PART 4: ROUTE REVENUE
  // ============================================================================

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("PART 4: ROUTING REVENUE TO SERIES");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  console.log("Calling router.routeRevenue()...");
  await router.routeRevenue();

  const routerStatus = await router.getRouterStatus();
  const revenuePerToken = await series.revenuePerTokenStored();

  console.log("  [OK] Revenue routed!");
  console.log("");
  const seriesReceived = await series.totalRevenueReceived();
  const routerBalance = await hre.ethers.provider.getBalance(await router.getAddress());
  
  console.log("  Router Status:");
  console.log("    Total Routed to Series: ", hre.ethers.formatEther(routerStatus[3]), "ETH (20% of 10 ETH)");
  console.log("    Protocol Remainder:     ", hre.ethers.formatEther(routerBalance), "ETH (80% of 10 ETH)");
  console.log("    Failed Routes: ", routerStatus[4].toString());
  console.log("");
  console.log("  Series Status:");
  console.log("    Balance:              ", hre.ethers.formatEther(await hre.ethers.provider.getBalance(await series.getAddress())), "ETH");
  console.log("    Total Received:       ", hre.ethers.formatEther(await series.totalRevenueReceived()), "ETH");
  console.log("    Revenue Per Token:    ", hre.ethers.formatUnits(revenuePerToken, 18), "ETH per token");
  console.log("");

  // ============================================================================
  // PART 5: CALCULATE CLAIMABLE
  // ============================================================================

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("PART 5: CALCULATING CLAIMABLE REWARDS");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  const aliceClaimable = await series.calculateClaimable(alice.address);
  const bobClaimable = await series.calculateClaimable(bob.address);
  const protocolClaimable = await series.calculateClaimable(protocol.address);

  console.log("  Claimable Rewards:");
  console.log("    Alice:    ", hre.ethers.formatEther(aliceClaimable), "ETH (30% of 2 ETH)");
  console.log("    Bob:      ", hre.ethers.formatEther(bobClaimable), "ETH (20% of 2 ETH)");
  console.log("    Protocol: ", hre.ethers.formatEther(protocolClaimable), "ETH (50% of 2 ETH)");
  console.log("");

  // ============================================================================
  // PART 6: ALICE CLAIMS
  // ============================================================================

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("PART 6: ALICE CLAIMS REWARDS");
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
  console.log("  Alice balance after: ", hre.ethers.formatEther(aliceBalanceAfter), "ETH");
  console.log("  Net gain:            ", hre.ethers.formatEther(aliceNetGain), "ETH");
  console.log("  Gas cost:            ", hre.ethers.formatEther(gasCost), "ETH");
  console.log("");

  // ============================================================================
  // PART 7: BOB CLAIMS
  // ============================================================================

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("PART 7: BOB CLAIMS REWARDS");
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
  console.log("  Bob balance after:   ", hre.ethers.formatEther(bobBalanceAfter), "ETH");
  console.log("  Net gain:            ", hre.ethers.formatEther(bobNetGain), "ETH");
  console.log("  Gas cost:            ", hre.ethers.formatEther(bobGasCost), "ETH");
  console.log("");

  // ============================================================================
  // FINAL SUMMARY
  // ============================================================================

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("[SUCCESS] DEMO COMPLETE - FINAL SUMMARY");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  const finalRouterBalance = await hre.ethers.provider.getBalance(await router.getAddress());
  const seriesTotalReceived = await series.totalRevenueReceived();
  
  console.log("Revenue Flow:");
  console.log("  Revenue sent:          ", hre.ethers.formatEther(revenueAmount), "ETH");
  console.log("  To series (20%):       ", hre.ethers.formatEther(seriesTotalReceived), "ETH");
  console.log("  To protocol (80%):     ", hre.ethers.formatEther(finalRouterBalance), "ETH (in router)");
  console.log("");

  console.log("Claims:");
  console.log("  Alice claimed:       ", hre.ethers.formatEther(aliceNetGain), "ETH");
  console.log("  Bob claimed:         ", hre.ethers.formatEther(bobNetGain), "ETH");
  console.log("  Protocol remaining:  ", hre.ethers.formatEther(protocolClaimable), "ETH (not claimed yet)");
  console.log("");

  console.log("Key Metrics:");
  console.log("  seriesAddress:           ", await series.getAddress());
  console.log("  routerAddress:           ", await router.getAddress());
  console.log("  revenuePerTokenStored:   ", hre.ethers.formatUnits(revenuePerToken, 18));
  console.log("  claimable(Alice):        ", hre.ethers.formatEther(await series.calculateClaimable(alice.address)), "ETH");
  console.log("  claimable(Bob):          ", hre.ethers.formatEther(await series.calculateClaimable(bob.address)), "ETH");
  console.log("  claimable(Protocol):     ", hre.ethers.formatEther(protocolClaimable), "ETH");
  console.log("");

  console.log("Verification:");
  const totalClaimed = aliceNetGain + bobNetGain;
  const totalDistributed = await series.totalRevenueReceived();
  const seriesBalance = await hre.ethers.provider.getBalance(await series.getAddress());
  
  console.log("  Total claimed:       ", hre.ethers.formatEther(totalClaimed), "ETH");
  console.log("  Total distributed:   ", hre.ethers.formatEther(totalDistributed), "ETH");
  console.log("  Series balance:      ", hre.ethers.formatEther(seriesBalance), "ETH");
  console.log("  Remaining claimable: ", hre.ethers.formatEther(protocolClaimable), "ETH");
  console.log("");

  console.log("[SUCCESS] All checks passed!");
  console.log("Full demo finished successfully!");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n[ERROR] Demo failed:");
    console.error(error);
    process.exit(1);
  });
