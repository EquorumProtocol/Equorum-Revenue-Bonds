const hre = require("hardhat");

async function main() {
  console.log("\n🔄 Transferring EQM tokens on Arbitrum One (Mainnet)...\n");

  const [sender] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  const recipient = "0x48CF80F950E52d6D55537a2A7de0Dbd7e1532f77";
  const eqmTokenAddress = "0xc735AbB9121A1eEdAAfB7D86AA4472c48e23cAB0";

  console.log("Transfer Info:");
  console.log("  Network:", network.name, `(chainId: ${network.chainId})`);
  console.log("  From:", sender.address);
  console.log("  To:", recipient);
  console.log("  Token:", eqmTokenAddress);
  console.log("");

  // ERC20 ABI (only what we need)
  const erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
  ];

  const token = new hre.ethers.Contract(eqmTokenAddress, erc20Abi, sender);

  // Get token info
  const symbol = await token.symbol();
  const decimals = await token.decimals();
  console.log("Token:", symbol, `(${decimals} decimals)`);
  console.log("");

  // Check sender balance
  const balance = await token.balanceOf(sender.address);
  console.log("Current balance:", hre.ethers.formatUnits(balance, decimals), symbol);

  if (balance === 0n) {
    console.log("❌ No tokens to transfer");
    return;
  }

  // Check ETH balance for gas
  const ethBalance = await hre.ethers.provider.getBalance(sender.address);
  console.log("ETH for gas:", hre.ethers.formatEther(ethBalance), "ETH");
  console.log("");

  if (ethBalance === 0n) {
    console.log("❌ No ETH for gas fees");
    return;
  }

  // Transfer all tokens
  console.log(`Transferring ${hre.ethers.formatUnits(balance, decimals)} ${symbol}...`);
  const tx = await token.transfer(recipient, balance);

  console.log("Transaction hash:", tx.hash);
  console.log("Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log("✅ Transaction confirmed in block:", receipt.blockNumber);
  console.log("");

  // Check new balances
  const newSenderBalance = await token.balanceOf(sender.address);
  const recipientBalance = await token.balanceOf(recipient);

  console.log("Final token balances:");
  console.log("  Sender:", hre.ethers.formatUnits(newSenderBalance, decimals), symbol);
  console.log("  Recipient:", hre.ethers.formatUnits(recipientBalance, decimals), symbol);
  console.log("");

  console.log("🎉 Transfer complete!");
  console.log("");
  console.log("View on Arbiscan:");
  console.log(`  https://arbiscan.io/tx/${tx.hash}`);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Transfer failed:");
    console.error(error);
    process.exit(1);
  });
