const hre = require("hardhat");

async function main() {
  console.log("\nSending Revenue to Protocol (for screenshot)\n");

  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  console.log("Network:", network.name);
  console.log("Sender:", deployer.address);
  console.log("");

  const routerAddress = "0x3D170736435F9D2e3eC7164dA56EC1DE0dd24A5F";
  const router = await hre.ethers.getContractAt("RevenueRouter", routerAddress);

  // Send revenue
  const revenueAmount = hre.ethers.parseEther("0.01");
  console.log("Sending", hre.ethers.formatEther(revenueAmount), "ETH to router...");
  
  const tx1 = await deployer.sendTransaction({
    to: routerAddress,
    value: revenueAmount
  });
  
  console.log("Transaction hash:", tx1.hash);
  await tx1.wait();
  console.log("[SUCCESS] Revenue sent to router");
  console.log("");

  // Route revenue
  console.log("Routing revenue to series...");
  const tx2 = await router.routeRevenue();
  console.log("Transaction hash:", tx2.hash);
  await tx2.wait();
  console.log("[SUCCESS] Revenue routed successfully");
  console.log("");

  console.log("Done! Now refresh your frontend to see claimable revenue!");
  console.log("   Frontend: http://localhost:5173");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n[ERROR] Failed:");
    console.error(error);
    process.exit(1);
  });
