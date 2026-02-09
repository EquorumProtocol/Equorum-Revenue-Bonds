const hre = require("hardhat");

async function main() {
    const network = hre.network.name;
    console.log(`\n🔍 Checking series on ${network}...\n`);

    // Factory addresses
    const factories = {
        arbitrumSepolia: "0x2B2b7DC0b8276b74dEb57bB30b7AA66697DF7dA8",
        arbitrum: "0x8afA0318363FfBc29Cc28B3C98d9139C08Af737b"
    };

    const factoryAddress = factories[network];
    
    if (!factoryAddress) {
        console.log("❌ No factory deployed on this network");
        return;
    }

    console.log(`📍 Factory: ${factoryAddress}\n`);

    // Get factory contract
    const factory = await hre.ethers.getContractAt("RevenueSeriesFactory", factoryAddress);

    try {
        // Get total series count
        const totalSeries = await factory.getTotalSeries();
        console.log(`📊 Total Series Created: ${totalSeries}\n`);

        if (totalSeries === 0n) {
            console.log("ℹ️  No series created yet");
            return;
        }

        // Get all series
        const allSeries = await factory.getAllSeries();
        
        console.log("📋 Series List:\n");
        
        for (let i = 0; i < allSeries.length; i++) {
            const seriesAddress = allSeries[i];
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`Series #${i + 1} (${String(i + 1).padStart(3, '0')})`);
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`Address: ${seriesAddress}`);
            
            try {
                // Get series contract
                const series = await hre.ethers.getContractAt("RevenueSeries", seriesAddress);
                
                // Get series info
                const name = await series.name();
                const symbol = await series.symbol();
                const protocol = await series.protocol();
                const revenueShareBPS = await series.revenueShareBPS();
                const maturityDate = await series.maturityDate();
                const totalSupply = await series.totalSupply();
                const totalRevenueReceived = await series.totalRevenueReceived();
                const active = await series.active();
                
                // Get router
                const routerAddress = await factory.getRouterForSeries(seriesAddress);
                
                console.log(`Name: ${name}`);
                console.log(`Symbol: ${symbol}`);
                console.log(`Protocol: ${protocol}`);
                console.log(`Router: ${routerAddress}`);
                console.log(`Revenue Share: ${revenueShareBPS / 100}%`);
                console.log(`Total Supply: ${hre.ethers.formatEther(totalSupply)} tokens`);
                console.log(`Total Revenue: ${hre.ethers.formatEther(totalRevenueReceived)} ETH`);
                console.log(`Maturity: ${new Date(Number(maturityDate) * 1000).toLocaleDateString()}`);
                console.log(`Status: ${active ? '✅ Active' : '❌ Matured'}`);
                
            } catch (error) {
                console.log(`⚠️  Could not fetch series details: ${error.message}`);
            }
            
            console.log();
        }
        
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
        console.log(`✅ Found ${totalSeries} series total\n`);
        
    } catch (error) {
        console.error("❌ Error querying factory:", error.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
