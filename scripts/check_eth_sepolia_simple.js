const { ethers } = require("ethers");

async function main() {
    const address = "0x48CF80F950E52d6D55537a2A7de0Dbd7e1532f77";
    
    console.log("\nChecking Ethereum Sepolia balance...");
    console.log("Address:", address, "\n");
    
    // Try multiple RPC endpoints
    const rpcEndpoints = [
        "https://ethereum-sepolia.publicnode.com",
        "https://rpc2.sepolia.org",
        "https://sepolia.gateway.tenderly.co"
    ];
    
    for (const rpc of rpcEndpoints) {
        try {
            console.log("Trying RPC:", rpc);
            const provider = new ethers.JsonRpcProvider(rpc);
            const balance = await provider.getBalance(address);
            
            console.log("\n✅ SUCCESS!");
            console.log("Balance:", ethers.formatEther(balance), "ETH");
            
            if (balance > 0n) {
                console.log("\n🎉 Você tem ETH no Ethereum Sepolia!");
                console.log("\n💡 Próximo passo: Fazer bridge para Arbitrum Sepolia");
                console.log("   Link: https://bridge.arbitrum.io/?destinationChain=arbitrum-sepolia&sourceChain=sepolia");
            } else {
                console.log("\n❌ Saldo zero no Ethereum Sepolia");
            }
            
            return;
        } catch (error) {
            console.log("❌ Failed:", error.message.substring(0, 100));
            continue;
        }
    }
    
    console.log("\n❌ Não foi possível conectar a nenhum RPC do Ethereum Sepolia");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\nError:", error.message);
        process.exit(1);
    });
