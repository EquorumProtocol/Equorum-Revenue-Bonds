const hre = require("hardhat");

async function main() {
  console.log("\n🔄 Transferring funds to new Rabby wallet...\n");

  const [sender] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  const recipient = "0x48CF80F950E52d6D55537a2A7de0Dbd7e1532f77";

  console.log("Transfer Info:");
  console.log("  Network:", network.name, `(chainId: ${network.chainId})`);
  console.log("  From:", sender.address);
  console.log("  To:", recipient);
  console.log("");

  // Get current balance
  const balance = await hre.ethers.provider.getBalance(sender.address);
  console.log("Current balance:", hre.ethers.formatEther(balance), "ETH");

  // Calculate amount to send (leave some for gas)
  const gasPrice = await hre.ethers.provider.getFeeData();
  const estimatedGas = 21000n; // Standard ETH transfer
  const gasCost = estimatedGas * (gasPrice.gasPrice || gasPrice.maxFeePerGas || 0n);
  const buffer = gasCost * 2n; // 2x buffer for safety
  
  const amountToSend = balance - buffer;

  if (amountToSend <= 0n) {
    console.log("❌ Insufficient balance to transfer (after gas costs)");
    return;
  }

  console.log("Amount to send:", hre.ethers.formatEther(amountToSend), "ETH");
  console.log("Gas buffer:", hre.ethers.formatEther(buffer), "ETH");
  console.log("");

  // Send transaction
  console.log("Sending transaction...");
  const tx = await sender.sendTransaction({
    to: recipient,
    value: amountToSend,
  });

  console.log("Transaction hash:", tx.hash);
  console.log("Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log("✅ Transaction confirmed in block:", receipt.blockNumber);
  console.log("");

  // Check new balances
  const newSenderBalance = await hre.ethers.provider.getBalance(sender.address);
  const recipientBalance = await hre.ethers.provider.getBalance(recipient);

  console.log("Final balances:");
  console.log("  Sender:", hre.ethers.formatEther(newSenderBalance), "ETH");
  console.log("  Recipient:", hre.ethers.formatEther(recipientBalance), "ETH");
  console.log("");

  console.log("🎉 Transfer complete!");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Transfer failed:");
    console.error(error);
    process.exit(1);
  });
