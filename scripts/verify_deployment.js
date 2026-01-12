const hre = require("hardhat");

async function main() {
  console.log("\nVerifying Deployed Contracts...\n");

  const network = await hre.ethers.provider.getNetwork();
  console.log("Network:", network.name, `(chainId: ${network.chainId})`);
  console.log("");

  // Arbitrum Sepolia deployment addresses
  const factoryAddress = "0x2B2b7DC0b8276b74dEb57bB30b7AA66697DF7dA8";
  const seriesAddress = "0xb42751FFBCFbe76dd5Fc919088B2a81B52C48D19";
  const routerAddress = "0x3D170736435F9D2e3eC7164dA56EC1DE0dd24A5F";

  console.log("Contract Addresses:");
  console.log("  Factory:", factoryAddress);
  console.log("  Series:", seriesAddress);
  console.log("  Router:", routerAddress);
  console.log("");

  // Get contract instances
  const series = await hre.ethers.getContractAt("RevenueSeries", seriesAddress);
  const router = await hre.ethers.getContractAt("RevenueRouter", routerAddress);

  // Get series info
  console.log("Series Information:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  const name = await series.name();
  const symbol = await series.symbol();
  const totalSupply = await series.totalSupply();
  const protocol = await series.protocol();
  const routerAddr = await series.router();
  const revenueShareBPS = await series.revenueShareBPS();
  const maturityDate = await series.maturityDate();
  const active = await series.active();
  const totalRevenueReceived = await series.totalRevenueReceived();

  console.log("  Name:", name);
  console.log("  Symbol:", symbol);
  console.log("  Total Supply:", hre.ethers.formatEther(totalSupply), "tokens");
  console.log("  Protocol:", protocol);
  console.log("  Router (from contract):", routerAddr);
  console.log("  Revenue Share:", revenueShareBPS.toString(), "BPS (", Number(revenueShareBPS) / 100, "%)");
  console.log("  Maturity Date:", new Date(Number(maturityDate) * 1000).toISOString());
  console.log("  Active:", active);
  console.log("  Total Revenue Received:", hre.ethers.formatEther(totalRevenueReceived), "ETH");
  console.log("");

  // Get series info via function
  console.log("Series Info (via getSeriesInfo):");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const seriesInfo = await series.getSeriesInfo();
  console.log("  [0] Protocol:", seriesInfo[0]);
  console.log("  [1] Revenue BPS:", seriesInfo[1].toString());
  console.log("  [2] Maturity:", new Date(Number(seriesInfo[2]) * 1000).toISOString());
  console.log("  [3] Total Revenue:", hre.ethers.formatEther(seriesInfo[3]), "ETH");
  console.log("  [4] Revenue Per Token:", seriesInfo[4].toString());
  console.log("  [5] Active:", seriesInfo[5]);
  
  const seconds = Number(seriesInfo[6]);
  const days = (seconds / 86400).toFixed(2);
  console.log("  [6] Time Remaining:", seconds, "seconds (~" + days + " days)");
  console.log("");

  // Get router status
  console.log("Router Status:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  const routerProtocol = await router.protocol();
  const routerSeries = await router.revenueSeries();
  const routerShareBPS = await router.revenueShareBPS();
  
  console.log("  Protocol:", routerProtocol);
  console.log("  Series:", routerSeries);
  console.log("  Revenue Share BPS:", routerShareBPS.toString());
  console.log("");

  console.log("Router Status (via getRouterStatus):");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const routerStatus = await router.getRouterStatus();
  console.log("  [0] Current Balance:", hre.ethers.formatEther(routerStatus[0]), "ETH");
  console.log("  [1] Total Received:", hre.ethers.formatEther(routerStatus[1]), "ETH");
  console.log("  [2] Total to Series:", hre.ethers.formatEther(routerStatus[2]), "ETH");
  console.log("  [3] Total to Protocol:", hre.ethers.formatEther(routerStatus[3]), "ETH");
  console.log("  [4] Failed Attempts:", routerStatus[4].toString());
  console.log("  [5] Share BPS:", routerStatus[5].toString());
  console.log("  [6] Can Route Now:", routerStatus[6]);
  console.log("");

  // Get ownership info
  const seriesOwner = await series.owner();
  const routerOwner = await router.owner();
  const totalTokenSupply = await series.totalTokenSupply();

  // Validation
  console.log("Validation:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  const checks = [
    { name: "Router matches", pass: routerAddr.toLowerCase() === routerAddress.toLowerCase() },
    { name: "Protocol matches", pass: protocol.toLowerCase() === routerProtocol.toLowerCase() },
    { name: "Series in router matches", pass: routerSeries.toLowerCase() === seriesAddress.toLowerCase() },
    { name: "Revenue share matches", pass: revenueShareBPS.toString() === routerShareBPS.toString() },
    { name: "Series owner is protocol", pass: seriesOwner.toLowerCase() === protocol.toLowerCase() },
    { name: "Router owner is protocol", pass: routerOwner.toLowerCase() === protocol.toLowerCase() },
    { name: "Total supply matches", pass: totalSupply.toString() === totalTokenSupply.toString() },
    { name: "Router protocol matches", pass: routerProtocol.toLowerCase() === protocol.toLowerCase() },
    { name: "Router series matches", pass: routerSeries.toLowerCase() === seriesAddress.toLowerCase() },
    { name: "Series is active", pass: active },
    { name: "Maturity date is future", pass: Number(maturityDate) > Math.floor(Date.now() / 1000) },
  ];

  checks.forEach(check => {
    console.log(`  ${check.pass ? "[PASS]" : "[FAIL]"} ${check.name}`);
  });
  console.log("");

  const allPassed = checks.every(c => c.pass);
  if (allPassed) {
    console.log("All checks passed! Deployment is correct.");
  } else {
    console.log("[WARNING] Some checks failed. Review deployment.");
  }
  console.log("");

  // Explorer links
  const explorerBase = network.chainId === 421614n 
    ? "https://sepolia.arbiscan.io" 
    : "https://arbiscan.io";
  
  console.log("Block Explorer Links:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Factory:", explorerBase + "/address/" + factoryAddress);
  console.log("  Series:", explorerBase + "/address/" + seriesAddress);
  console.log("  Router:", explorerBase + "/address/" + routerAddress);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n[ERROR] Verification failed:");
    console.error(error);
    process.exit(1);
  });
