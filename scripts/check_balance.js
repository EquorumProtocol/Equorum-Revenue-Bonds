const hre = require("hardhat");

async function main() {
  const address = "0x48CF80F950E52d6D55537a2A7de0Dbd7e1532f77";
  const network = await hre.ethers.provider.getNetwork();
  
  console.log("\nChecking balance on", network.name, `(chainId: ${network.chainId})`);
  console.log("Address:", address);
  
  const balance = await hre.ethers.provider.getBalance(address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH");
  
  // Check transaction
  const txHash = "0xa83b74ea02fc86e1d13b41c0a32de6207c82b0b43f6b6fbe6ba191310c189841";
  console.log("\nChecking transaction:", txHash);
  
  const tx = await hre.ethers.provider.getTransaction(txHash);
  if (tx) {
    console.log("Transaction found:");
    console.log("  From:", tx.from);
    console.log("  To:", tx.to);
    console.log("  Value:", hre.ethers.formatEther(tx.value), "ETH");
    console.log("  Block:", tx.blockNumber);
    
    const receipt = await hre.ethers.provider.getTransactionReceipt(txHash);
    console.log("  Status:", receipt.status === 1 ? "✅ Success" : "❌ Failed");
  } else {
    console.log("Transaction not found");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
