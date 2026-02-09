const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
    console.log("\n=== Distributing Genesis Revenue (Symbolic) ===\n");

    // Genesis series address
    const SERIES_ADDRESS = "0x88122C5805281bAbF3B172fA212a6F6300Bb1EF3";
    
    // Symbolic revenue amount (~$10)
    const REVENUE_AMOUNT = ethers.parseEther("0.003"); // 0.003 ETH

    console.log("Series Address:", SERIES_ADDRESS);
    console.log("Revenue Amount:", ethers.formatEther(REVENUE_AMOUNT), "ETH");
    console.log();

    // Get signer
    const [signer] = await ethers.getSigners();
    console.log("Signer:", signer.address);
    
    // Check balance
    const balance = await ethers.provider.getBalance(signer.address);
    console.log("Balance:", ethers.formatEther(balance), "ETH");
    
    if (balance < REVENUE_AMOUNT) {
        console.error("❌ Insufficient balance!");
        process.exit(1);
    }
    console.log();

    // Get series contract
    const series = await ethers.getContractAt("RevenueSeries", SERIES_ADDRESS);
    
    // Get series info
    console.log("Series Info:");
    const name = await series.name();
    const symbol = await series.symbol();
    const totalSupply = await series.totalSupply();
    const yourBalance = await series.balanceOf(signer.address);
    
    console.log("- Name:", name);
    console.log("- Symbol:", symbol);
    console.log("- Total Supply:", ethers.formatEther(totalSupply));
    console.log("- Your Balance:", ethers.formatEther(yourBalance));
    console.log("- Your Share:", (Number(yourBalance) / Number(totalSupply) * 100).toFixed(2) + "%");
    console.log();

    // Distribute revenue
    console.log("Distributing revenue...");
    const tx = await series.distributeRevenue({ value: REVENUE_AMOUNT });

    console.log("Transaction hash:", tx.hash);
    console.log("Waiting for confirmation...");
    
    const receipt = await tx.wait();
    console.log("✅ Transaction confirmed!");
    console.log("Block:", receipt.blockNumber);
    console.log("Gas used:", receipt.gasUsed.toString());
    console.log();

    // Check claimable amount
    const claimable = await series.calculateClaimable(signer.address);
    console.log("=== Revenue Distributed Successfully! ===");
    console.log();
    console.log("Revenue deposited:", ethers.formatEther(REVENUE_AMOUNT), "ETH");
    console.log("Your claimable amount:", ethers.formatEther(claimable), "ETH");
    console.log();
    console.log("View on Arbiscan:");
    console.log("- Transaction:", `https://arbiscan.io/tx/${tx.hash}`);
    console.log("- Series:", `https://arbiscan.io/address/${SERIES_ADDRESS}`);
    console.log();
    console.log("Next steps:");
    console.log("1. Check series balance on Arbiscan (should show 0.003 ETH)");
    console.log("2. Series now shows as 'Active' with revenue distributed");
    console.log("3. You can claim your revenue back anytime with claimRevenue()");
    console.log("4. Post on Discord/Bitcointalk: 'First revenue already distributed!'");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
