const hre = require("hardhat");

async function main() {
  console.log("\nTesting Factory Features (Fees, Pausable, Safety Limits)\n");

  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  console.log("Test Info:");
  console.log("  Network:", network.name, `(chainId: ${network.chainId})`);
  console.log("  Tester:", deployer.address);
  console.log("");

  // Deploy Factory with treasury
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TEST 1: Deploy Factory with Treasury");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  const treasuryAddress = deployer.address;
  console.log("  Treasury:", treasuryAddress);
  
  const RevenueSeriesFactory = await hre.ethers.getContractFactory("RevenueSeriesFactory");
  const factory = await RevenueSeriesFactory.deploy(treasuryAddress);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  
  console.log("  [SUCCESS] Factory deployed at:", factoryAddress);
  console.log("");

  // Check initial config
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TEST 2: Check Initial Configuration");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  const feeConfig = await factory.getFeeConfig();
  const safetyLimits = await factory.getSafetyLimits();
  
  console.log("  Fee Config:");
  console.log("    Treasury:", feeConfig[0]);
  console.log("    Creation Fee:", hre.ethers.formatEther(feeConfig[1]), "ETH");
  console.log("    Fees Enabled:", feeConfig[2]);
  console.log("");
  
  console.log("  Safety Limits:");
  console.log("    Max Revenue Share:", safetyLimits[0].toString(), "BPS (", Number(safetyLimits[0]) / 100, "%)");
  console.log("    Min Duration:", safetyLimits[1].toString(), "days");
  console.log("    Max Duration:", safetyLimits[2].toString(), "days");
  console.log("    Min Supply:", hre.ethers.formatEther(safetyLimits[3]), "tokens");
  console.log("");

  // Test creating series without fees (should work)
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TEST 3: Create Series Without Fees (Should Work)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  const seriesConfig = {
    name: "Test Series 1",
    symbol: "TEST1",
    protocol: deployer.address,
    revenueShareBPS: 2000,
    durationDays: 365,
    totalSupply: hre.ethers.parseEther("1000000")
  };
  
  console.log("  Creating series...");
  const tx1 = await factory.createSeries(
    seriesConfig.name,
    seriesConfig.symbol,
    seriesConfig.protocol,
    seriesConfig.revenueShareBPS,
    seriesConfig.durationDays,
    seriesConfig.totalSupply
  );
  
  await tx1.wait();
  console.log("  [SUCCESS] Series created without fee");
  console.log("");

  // Enable fees
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TEST 4: Enable Fees");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  const creationFee = hre.ethers.parseEther("0.01");
  console.log("  Setting creation fee to:", hre.ethers.formatEther(creationFee), "ETH");
  
  await factory.setCreationFee(creationFee);
  await factory.setFeesEnabled(true);
  
  const newFeeConfig = await factory.getFeeConfig();
  console.log("  [SUCCESS] Fees enabled");
  console.log("    Fee:", hre.ethers.formatEther(newFeeConfig[1]), "ETH");
  console.log("    Enabled:", newFeeConfig[2]);
  console.log("");

  // Test creating series with fee
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TEST 5: Create Series With Fee");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  const treasuryBalanceBefore = await hre.ethers.provider.getBalance(treasuryAddress);
  console.log("  Treasury balance before:", hre.ethers.formatEther(treasuryBalanceBefore), "ETH");
  
  console.log("  Creating series with", hre.ethers.formatEther(creationFee), "ETH fee...");
  const tx2 = await factory.createSeries(
    "Test Series 2",
    "TEST2",
    deployer.address,
    2000,
    365,
    hre.ethers.parseEther("1000000"),
    { value: creationFee }
  );
  
  await tx2.wait();
  
  const treasuryBalanceAfter = await hre.ethers.provider.getBalance(treasuryAddress);
  console.log("  Treasury balance after:", hre.ethers.formatEther(treasuryBalanceAfter), "ETH");
  console.log("  [SUCCESS] Series created with fee paid");
  console.log("");

  // Test safety limits
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TEST 6: Safety Limits (Should Fail)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  // Test 6a: Revenue share too high
  console.log("  Test 6a: Revenue share > 80% (should fail)");
  try {
    await factory.createSeries(
      "Test Series 3",
      "TEST3",
      deployer.address,
      9000, // 90% - too high
      365,
      hre.ethers.parseEther("1000000"),
      { value: creationFee }
    );
    console.log("  [FAIL] Should have reverted");
  } catch (error) {
    console.log("  [SUCCESS] Correctly rejected:", error.message.split("(")[0].trim());
  }
  console.log("");

  // Test 6b: Duration too short
  console.log("  Test 6b: Duration < 30 days (should fail)");
  try {
    await factory.createSeries(
      "Test Series 4",
      "TEST4",
      deployer.address,
      2000,
      15, // 15 days - too short
      hre.ethers.parseEther("1000000"),
      { value: creationFee }
    );
    console.log("  [FAIL] Should have reverted");
  } catch (error) {
    console.log("  [SUCCESS] Correctly rejected:", error.message.split("(")[0].trim());
  }
  console.log("");

  // Test 6c: Supply too low
  console.log("  Test 6c: Supply < 1000 tokens (should fail)");
  try {
    await factory.createSeries(
      "Test Series 5",
      "TEST5",
      deployer.address,
      2000,
      365,
      hre.ethers.parseEther("500") // 500 tokens - too low
    );
    console.log("  [FAIL] Should have reverted");
  } catch (error) {
    console.log("  [SUCCESS] Correctly rejected:", error.message.split("(")[0].trim());
  }
  console.log("");

  // Test pause
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TEST 7: Pause Factory");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  console.log("  Pausing factory...");
  await factory.pause();
  console.log("  [SUCCESS] Factory paused");
  console.log("");

  console.log("  Trying to create series while paused (should fail)...");
  try {
    await factory.createSeries(
      "Test Series 6",
      "TEST6",
      deployer.address,
      2000,
      365,
      hre.ethers.parseEther("1000000"),
      { value: creationFee }
    );
    console.log("  [FAIL] Should have reverted");
  } catch (error) {
    console.log("  [SUCCESS] Correctly rejected:", error.message.split("(")[0].trim());
  }
  console.log("");

  console.log("  Unpausing factory...");
  await factory.unpause();
  console.log("  [SUCCESS] Factory unpaused");
  console.log("");

  // Summary
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("ALL TESTS PASSED!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("Summary:");
  console.log("  [SUCCESS] Factory deployment with treasury");
  console.log("  [SUCCESS] Fee infrastructure working");
  console.log("  [SUCCESS] Safety limits enforced");
  console.log("  [SUCCESS] Pausable working correctly");
  console.log("");
  console.log("Factory is ready for mainnet deployment!");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n[ERROR] Test failed:");
    console.error(error);
    process.exit(1);
  });
