const hre = require("hardhat");

async function main() {
    const address = "0x48CF80F950E52d6D55537a2A7de0Dbd7e1532f77";
    
    console.log("\n" + "=".repeat(60));
    console.log("Checking Ethereum Sepolia Balance");
    console.log("=".repeat(60) + "\n");
    console.log("Address:", address);
    
    // Create provider for Ethereum Sepolia
    const provider = new hre.ethers.JsonRpcProvider(
        process.env.ETHEREUM_SEPOLIA_RPC || "https://rpc.sepolia.org"
    );
    
    try {
        const balance = await provider.getBalance(address);
        console.log("Balance:", hre.ethers.formatEther(balance), "ETH");
        
        if (balance > 0n) {
            console.log("\n✅ Você tem ETH no Ethereum Sepolia!");
            console.log("💡 Pode fazer bridge para Arbitrum Sepolia:");
            console.log("   https://bridge.arbitrum.io/?destinationChain=arbitrum-sepolia&sourceChain=sepolia");
        } else {
            console.log("\n❌ Sem ETH no Ethereum Sepolia");
        }
    } catch (error) {
        console.log("❌ Erro ao verificar saldo:", error.message);
    }
    
    console.log("\n" + "=".repeat(60) + "\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
