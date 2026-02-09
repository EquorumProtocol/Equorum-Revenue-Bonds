const hre = require("hardhat");

async function main() {
    const txHash = "0x2bc564203878169f1ca4ffab96c3d0d80406126d17e3eec6fedb5a793ba1769d";
    const address = "0x48CF80F950E52d6D55537a2A7de0Dbd7e1532f77";
    
    console.log("\nChecking transaction:", txHash);
    console.log("Address:", address, "\n");
    
    try {
        const tx = await hre.ethers.provider.getTransaction(txHash);
        
        if (tx) {
            console.log("✅ Transaction found!");
            console.log("From:", tx.from);
            console.log("To:", tx.to);
            console.log("Value:", hre.ethers.formatEther(tx.value), "ETH");
            console.log("Block:", tx.blockNumber);
            
            const receipt = await hre.ethers.provider.getTransactionReceipt(txHash);
            if (receipt) {
                console.log("Status:", receipt.status === 1 ? "✅ Success" : "❌ Failed");
            }
        } else {
            console.log("❌ Transaction not found or pending");
        }
    } catch (error) {
        console.log("❌ Error:", error.message);
    }
    
    // Check current balance
    console.log("\n" + "=".repeat(50));
    const balance = await hre.ethers.provider.getBalance(address);
    console.log("Current balance:", hre.ethers.formatEther(balance), "ETH");
    console.log("=".repeat(50) + "\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
