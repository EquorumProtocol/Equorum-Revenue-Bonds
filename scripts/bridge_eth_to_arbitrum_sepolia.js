// ============================================
// BRIDGE ETH: Ethereum Sepolia → Arbitrum Sepolia
// ============================================
// Automatically bridge ETH from Ethereum Sepolia to Arbitrum Sepolia

const hre = require("hardhat");

// Arbitrum Inbox contract on Ethereum Sepolia (official bridge)
const ARBITRUM_INBOX_SEPOLIA = "0xaAe29B0366299461418F5324a79Afc425BE5ae21";

async function main() {
    console.log("\n" + "=".repeat(70));
    console.log("🌉 BRIDGE ETH: Ethereum Sepolia → Arbitrum Sepolia");
    console.log("=".repeat(70) + "\n");

    // Connect to Ethereum Sepolia
    const ethSepoliaProvider = new hre.ethers.JsonRpcProvider(
        "https://ethereum-sepolia.publicnode.com"
    );
    
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("❌ PRIVATE_KEY not found in .env");
    }
    
    const wallet = new hre.ethers.Wallet(privateKey, ethSepoliaProvider);
    
    console.log("From Address:", wallet.address);
    
    // Check balance
    const balance = await ethSepoliaProvider.getBalance(wallet.address);
    console.log("Current Balance (Ethereum Sepolia):", hre.ethers.formatEther(balance), "ETH\n");
    
    if (balance === 0n) {
        throw new Error("❌ No ETH to bridge");
    }
    
    // Calculate amount to bridge (leave some for gas)
    const gasReserve = hre.ethers.parseEther("0.001"); // Reserve for gas
    const amountToBridge = balance - gasReserve;
    
    if (amountToBridge <= 0n) {
        throw new Error("❌ Not enough ETH (need at least 0.001 ETH for gas)");
    }
    
    console.log("Amount to bridge:", hre.ethers.formatEther(amountToBridge), "ETH");
    console.log("Gas reserve:", hre.ethers.formatEther(gasReserve), "ETH");
    console.log("");
    
    // Arbitrum Inbox ABI (depositEth function)
    const inboxAbi = [
        "function depositEth() external payable returns (uint256)"
    ];
    
    const inbox = new hre.ethers.Contract(
        ARBITRUM_INBOX_SEPOLIA,
        inboxAbi,
        wallet
    );
    
    console.log("⚠️  Starting bridge transaction...");
    console.log("This will take ~10 minutes to complete on Arbitrum Sepolia\n");
    
    try {
        // Send bridge transaction
        const tx = await inbox.depositEth({
            value: amountToBridge,
            gasLimit: 200000n
        });
        
        console.log("✅ Bridge transaction sent!");
        console.log("Tx Hash:", tx.hash);
        console.log("\nWaiting for confirmation on Ethereum Sepolia...");
        
        const receipt = await tx.wait();
        
        console.log("\n✅ Transaction confirmed on Ethereum Sepolia!");
        console.log("Block:", receipt.blockNumber);
        console.log("Gas used:", receipt.gasUsed.toString());
        
        console.log("\n" + "=".repeat(70));
        console.log("🎉 BRIDGE INITIATED SUCCESSFULLY!");
        console.log("=".repeat(70));
        
        console.log("\n📝 Summary:");
        console.log("- Amount bridged:", hre.ethers.formatEther(amountToBridge), "ETH");
        console.log("- From: Ethereum Sepolia");
        console.log("- To: Arbitrum Sepolia");
        console.log("- Destination address:", wallet.address);
        
        console.log("\n⏳ Estimated arrival time: ~10 minutes");
        console.log("\n🔗 Track on Etherscan:");
        console.log("   https://sepolia.etherscan.io/tx/" + tx.hash);
        
        console.log("\n💡 Next steps:");
        console.log("   1. Wait ~10 minutes for ETH to arrive on Arbitrum Sepolia");
        console.log("   2. Check balance: npx hardhat run scripts/check_balance.js --network arbitrumSepolia");
        console.log("   3. Run tests: npx hardhat run scripts/test_v2_exhaustive.js --network arbitrumSepolia");
        console.log("");
        
    } catch (error) {
        console.error("\n❌ Bridge failed:", error.message);
        
        if (error.message.includes("insufficient funds")) {
            console.log("\n💡 Try reducing the amount or add more ETH for gas");
        }
        
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Error:", error.message);
        process.exit(1);
    });
