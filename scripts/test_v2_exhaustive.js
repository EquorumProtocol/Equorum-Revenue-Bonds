// ============================================
// TESTES EXAUSTIVOS V2 - ARBITRUM SEPOLIA
// ============================================
// Validação completa de todas as funcionalidades V2 antes de mainnet

const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

// Test results tracker
const testResults = {
    passed: [],
    failed: [],
    warnings: []
};

function logTest(name, passed, details = '') {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} - ${name}`);
    if (details) console.log(`   ${details}`);
    
    if (passed) {
        testResults.passed.push({ name, details });
    } else {
        testResults.failed.push({ name, details });
    }
}

function logWarning(message) {
    console.log(`⚠️  WARNING - ${message}`);
    testResults.warnings.push(message);
}

async function main() {
    console.log("\n" + "=".repeat(70));
    console.log("🧪 TESTES EXAUSTIVOS V2 - ARBITRUM SEPOLIA");
    console.log("=".repeat(70) + "\n");

    const [deployer] = await hre.ethers.getSigners();
    const network = await hre.ethers.provider.getNetwork();
    
    console.log("Tester:", deployer.address);
    console.log("Network:", network.name, "(chainId:", network.chainId, ")");
    
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("Balance:", hre.ethers.formatEther(balance), "ETH\n");

    // Load deployment info
    const deploymentPath = path.join(__dirname, '../deployments/arbitrum-sepolia/v2-deployment.json');
    if (!fs.existsSync(deploymentPath)) {
        throw new Error("❌ V2 deployment not found. Run deploy_v2_testnet.js first.");
    }
    
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    const FACTORY_ADDRESS = deployment.contracts.factory;
    const REPUTATION_ADDRESS = deployment.contracts.reputationRegistry;
    
    console.log("Factory:", FACTORY_ADDRESS);
    console.log("Reputation Registry:", REPUTATION_ADDRESS);
    console.log("\n" + "=".repeat(70) + "\n");

    // Get contract instances
    const factory = await hre.ethers.getContractAt(
        "contracts/v2/core/RevenueSeriesFactory.sol:RevenueSeriesFactory",
        FACTORY_ADDRESS
    );
    const reputationRegistry = await hre.ethers.getContractAt(
        "contracts/v2/registry/ProtocolReputationRegistry.sol:ProtocolReputationRegistry",
        REPUTATION_ADDRESS
    );

    // ============================================
    // TESTE 1: VERIFICAR CONFIGURAÇÃO DO FACTORY
    // ============================================
    console.log("📋 TESTE 1: Verificar Configuração do Factory\n");
    
    try {
        const treasury = await factory.treasury();
        const repRegistry = await factory.reputationRegistry();
        const feesEnabled = await factory.feesEnabled();
        const creationFee = await factory.creationFeeETH();
        
        logTest("Factory.treasury() retorna endereço válido", treasury !== hre.ethers.ZeroAddress);
        logTest("Factory.reputationRegistry() aponta para contrato correto", repRegistry === REPUTATION_ADDRESS);
        logTest("Factory.feesEnabled() está desabilitado (testnet)", !feesEnabled);
        logTest("Factory.creationFeeETH() é zero", creationFee === 0n);
        
        // Verificar safety limits
        const maxRevShare = await factory.MAX_REVENUE_SHARE_BPS();
        const minDuration = await factory.MIN_DURATION_DAYS();
        const maxDuration = await factory.MAX_DURATION_DAYS();
        const minSupply = await factory.MIN_TOTAL_SUPPLY();
        
        logTest("MAX_REVENUE_SHARE_BPS = 5000 (50%)", maxRevShare === 5000n);
        logTest("MIN_DURATION_DAYS = 30", minDuration === 30n);
        logTest("MAX_DURATION_DAYS = 1825 (5 anos)", maxDuration === 1825n);
        logTest("MIN_TOTAL_SUPPLY = 1000e18", minSupply === hre.ethers.parseEther("1000"));
        
    } catch (error) {
        logTest("Configuração do Factory", false, error.message);
    }

    console.log("\n" + "=".repeat(70) + "\n");

    // ============================================
    // TESTE 2: CRIAR SÉRIE SOFT BOND VÁLIDA
    // ============================================
    console.log("📋 TESTE 2: Criar Série Soft Bond Válida\n");
    
    let seriesAddress, routerAddress;
    
    try {
        const SERIES_NAME = "Test Revenue Bonds V2 - Exaustivo";
        const SERIES_SYMBOL = "TEST-RB-V2";
        const PROTOCOL = deployer.address;
        const REVENUE_SHARE_BPS = 2500; // 25%
        const DURATION_DAYS = 180; // 6 meses
        const TOTAL_SUPPLY = hre.ethers.parseEther("100000"); // 100k tokens
        const MIN_DISTRIBUTION = hre.ethers.parseEther("0.001"); // 0.001 ETH
        
        console.log("Parâmetros:");
        console.log("- Name:", SERIES_NAME);
        console.log("- Symbol:", SERIES_SYMBOL);
        console.log("- Protocol:", PROTOCOL);
        console.log("- Revenue Share:", REVENUE_SHARE_BPS / 100, "%");
        console.log("- Duration:", DURATION_DAYS, "days");
        console.log("- Total Supply:", hre.ethers.formatEther(TOTAL_SUPPLY), "tokens");
        console.log("- Min Distribution:", hre.ethers.formatEther(MIN_DISTRIBUTION), "ETH\n");
        
        const tx = await factory.createSeries(
            SERIES_NAME,
            SERIES_SYMBOL,
            PROTOCOL,
            REVENUE_SHARE_BPS,
            DURATION_DAYS,
            TOTAL_SUPPLY,
            MIN_DISTRIBUTION
        );
        
        const receipt = await tx.wait();
        const gasUsed = receipt.gasUsed;
        
        // Get series address from event
        const event = receipt.logs.find(log => {
            try {
                const parsed = factory.interface.parseLog(log);
                return parsed && parsed.name === 'SeriesCreated';
            } catch {
                return false;
            }
        });
        
        if (event) {
            const parsed = factory.interface.parseLog(event);
            seriesAddress = parsed.args.series;
            routerAddress = parsed.args.router;
            
            logTest("Série criada com sucesso", true, `Series: ${seriesAddress}`);
            logTest("Router criado com sucesso", true, `Router: ${routerAddress}`);
            logTest("Gas usado para criação", gasUsed < 5000000n, `${gasUsed.toString()} gas`);
        } else {
            logTest("Evento SeriesCreated emitido", false, "Evento não encontrado");
        }
        
    } catch (error) {
        logTest("Criação de Série Soft Bond", false, error.message);
    }

    if (!seriesAddress) {
        console.log("\n❌ Não foi possível criar série. Abortando testes.\n");
        return;
    }

    console.log("\n" + "=".repeat(70) + "\n");

    // ============================================
    // TESTE 3: VERIFICAR PARÂMETROS DA SÉRIE
    // ============================================
    console.log("📋 TESTE 3: Verificar Parâmetros da Série\n");
    
    try {
        const series = await hre.ethers.getContractAt(
            "contracts/v2/core/RevenueSeries.sol:RevenueSeries",
            seriesAddress
        );
        
        const name = await series.name();
        const symbol = await series.symbol();
        const totalSupply = await series.totalSupply();
        const protocol = await series.protocol();
        const router = await series.router();
        const revenueShareBPS = await series.revenueShareBPS();
        const maturityDate = await series.maturityDate();
        const active = await series.active();
        
        logTest("Nome da série correto", name === "Test Revenue Bonds V2 - Exaustivo");
        logTest("Símbolo da série correto", symbol === "TEST-RB-V2");
        logTest("Total supply correto", totalSupply === hre.ethers.parseEther("100000"));
        logTest("Protocol é o deployer", protocol === deployer.address);
        logTest("Router address válido", router === routerAddress);
        logTest("Revenue share correto", revenueShareBPS === 2500n);
        logTest("Série está ativa", active === true);
        
        // Verificar maturity date (deve ser ~180 dias no futuro)
        const now = Math.floor(Date.now() / 1000);
        const expectedMaturity = now + (180 * 24 * 60 * 60);
        const maturityDiff = Math.abs(Number(maturityDate) - expectedMaturity);
        logTest("Maturity date correto (~180 dias)", maturityDiff < 3600, `Diff: ${maturityDiff}s`);
        
        // Verificar saldo de tokens do deployer
        const deployerBalance = await series.balanceOf(deployer.address);
        logTest("Deployer recebeu todos os tokens", deployerBalance === totalSupply);
        
    } catch (error) {
        logTest("Verificação de parâmetros da série", false, error.message);
    }

    console.log("\n" + "=".repeat(70) + "\n");

    // ============================================
    // TESTE 4: DISTRIBUIR REVENUE
    // ============================================
    console.log("📋 TESTE 4: Distribuir Revenue para a Série\n");
    
    try {
        const series = await hre.ethers.getContractAt(
            "contracts/v2/core/RevenueSeries.sol:RevenueSeries",
            seriesAddress
        );
        
        const revenueAmount = hre.ethers.parseEther("0.001"); // 0.001 ETH (mínimo do contrato)
        console.log("Distribuindo", hre.ethers.formatEther(revenueAmount), "ETH...\n");
        
        const totalRevenueBefore = await series.totalRevenueReceived();
        
        const tx = await series.distributeRevenue({ value: revenueAmount });
        const receipt = await tx.wait();
        
        const totalRevenueAfter = await series.totalRevenueReceived();
        
        logTest("Revenue distribuído com sucesso", true, `Tx: ${tx.hash}`);
        logTest("totalRevenueReceived atualizado", totalRevenueAfter === totalRevenueBefore + revenueAmount);
        logTest("Gas usado para distribuição", receipt.gasUsed < 250000n, `${receipt.gasUsed.toString()} gas`);
        
    } catch (error) {
        logTest("Distribuição de Revenue", false, error.message);
    }

    console.log("\n" + "=".repeat(70) + "\n");

    // ============================================
    // TESTE 5: CALCULAR E CLAIM REVENUE
    // ============================================
    console.log("📋 TESTE 5: Calcular e Claim Revenue\n");
    
    try {
        const series = await hre.ethers.getContractAt(
            "contracts/v2/core/RevenueSeries.sol:RevenueSeries",
            seriesAddress
        );
        
        // Calcular claimable
        const claimable = await series.calculateClaimable(deployer.address);
        console.log("Claimable:", hre.ethers.formatEther(claimable), "ETH\n");
        
        logTest("calculateClaimable retorna valor > 0", claimable > 0n, `${hre.ethers.formatEther(claimable)} ETH`);
        
        if (claimable > 0n) {
            const balanceBefore = await hre.ethers.provider.getBalance(deployer.address);
            
            const tx = await series.claimRevenue();
            const receipt = await tx.wait();
            
            const balanceAfter = await hre.ethers.provider.getBalance(deployer.address);
            const gasCost = receipt.gasUsed * receipt.gasPrice;
            const netReceived = balanceAfter - balanceBefore + gasCost;
            
            logTest("Claim executado com sucesso", true, `Tx: ${tx.hash}`);
            logTest("ETH recebido corresponde ao claimable", netReceived === claimable, `Received: ${hre.ethers.formatEther(netReceived)} ETH`);
            logTest("Gas usado para claim", receipt.gasUsed < 150000n, `${receipt.gasUsed.toString()} gas`);
            
            // Verificar que não há mais nada para claim
            const claimableAfter = await series.calculateClaimable(deployer.address);
            logTest("Claimable zerado após claim", claimableAfter === 0n);
        }
        
    } catch (error) {
        logTest("Cálculo e Claim de Revenue", false, error.message);
    }

    console.log("\n" + "=".repeat(70) + "\n");

    // ============================================
    // TESTE 6: REPUTATION TRACKING
    // ============================================
    console.log("📋 TESTE 6: Verificar Reputation Tracking\n");
    
    try {
        const protocolStats = await reputationRegistry.protocolStats(deployer.address);
        const reputationScore = await reputationRegistry.getReputationScore(deployer.address);
        
        logTest("Protocol tem séries criadas", protocolStats.totalSeriesCreated > 0n, `Count: ${protocolStats.totalSeriesCreated}`);
        logTest("Total revenue delivered > 0", protocolStats.totalRevenueDelivered > 0n, `Total: ${hre.ethers.formatEther(protocolStats.totalRevenueDelivered)} ETH`);
        logTest("Reputation score calculado", reputationScore >= 0n && reputationScore <= 100n, `Score: ${reputationScore}`);
        logTest("Protocol não está blacklisted", !protocolStats.blacklisted);
        
    } catch (error) {
        logTest("Reputation Tracking", false, error.message);
    }

    console.log("\n" + "=".repeat(70) + "\n");

    // ============================================
    // TESTE 7: SAFETY LIMITS - SÉRIE INVÁLIDA
    // ============================================
    console.log("📋 TESTE 7: Testar Safety Limits (Série Inválida)\n");
    
    // Teste 7a: Revenue share muito alto (>50%)
    try {
        await factory.createSeries(
            "Invalid Series - High Rev Share",
            "INVALID-1",
            deployer.address,
            6000, // 60% - INVÁLIDO
            180,
            hre.ethers.parseEther("10000"),
            hre.ethers.parseEther("0.001")
        );
        logTest("Rejeitar revenue share > 50%", false, "Deveria ter falhado mas passou");
    } catch (error) {
        logTest("Rejeitar revenue share > 50%", true, "Corretamente rejeitado");
    }
    
    // Teste 7b: Duration muito curta (<30 dias)
    try {
        await factory.createSeries(
            "Invalid Series - Short Duration",
            "INVALID-2",
            deployer.address,
            2000,
            15, // 15 dias - INVÁLIDO
            hre.ethers.parseEther("10000"),
            hre.ethers.parseEther("0.001")
        );
        logTest("Rejeitar duration < 30 dias", false, "Deveria ter falhado mas passou");
    } catch (error) {
        logTest("Rejeitar duration < 30 dias", true, "Corretamente rejeitado");
    }
    
    // Teste 7c: Total supply muito baixo (<1000 tokens)
    try {
        await factory.createSeries(
            "Invalid Series - Low Supply",
            "INVALID-3",
            deployer.address,
            2000,
            180,
            hre.ethers.parseEther("500"), // 500 tokens - INVÁLIDO
            hre.ethers.parseEther("0.001")
        );
        logTest("Rejeitar total supply < 1000 tokens", false, "Deveria ter falhado mas passou");
    } catch (error) {
        logTest("Rejeitar total supply < 1000 tokens", true, "Corretamente rejeitado");
    }

    console.log("\n" + "=".repeat(70) + "\n");

    // ============================================
    // TESTE 8: PAUSE/UNPAUSE FACTORY
    // ============================================
    console.log("📋 TESTE 8: Testar Pause/Unpause do Factory\n");
    
    try {
        // Pausar
        const pauseTx = await factory.pause();
        await pauseTx.wait();
        
        const isPaused = await factory.paused();
        logTest("Factory pausado com sucesso", isPaused);
        
        // Tentar criar série enquanto pausado (deve falhar)
        try {
            await factory.createSeries(
                "Should Fail",
                "FAIL",
                deployer.address,
                2000,
                180,
                hre.ethers.parseEther("10000"),
                hre.ethers.parseEther("0.001")
            );
            logTest("Rejeitar criação enquanto pausado", false, "Deveria ter falhado mas passou");
        } catch (error) {
            logTest("Rejeitar criação enquanto pausado", true, "Corretamente rejeitado");
        }
        
        // Despausar
        const unpauseTx = await factory.unpause();
        await unpauseTx.wait();
        
        const isUnpaused = !(await factory.paused());
        logTest("Factory despausado com sucesso", isUnpaused);
        
    } catch (error) {
        logTest("Pause/Unpause do Factory", false, error.message);
    }

    console.log("\n" + "=".repeat(70) + "\n");

    // ============================================
    // TESTE 9: VERIFICAR GAS COSTS
    // ============================================
    console.log("📋 TESTE 9: Análise de Gas Costs\n");
    
    console.log("Gas Costs Observados:");
    console.log("- Deploy ReputationRegistry: 1,408,670 gas");
    console.log("- Deploy Factory: 4,367,651 gas");
    console.log("- Create Series: ~4,500,000 gas");
    console.log("- Distribute Revenue: <200,000 gas");
    console.log("- Claim Revenue: <150,000 gas");
    
    logWarning("Gas costs são altos mas esperados para contratos complexos");
    logWarning("Considerar otimizações futuras se necessário");

    // ============================================
    // SUMMARY
    // ============================================
    console.log("\n" + "=".repeat(70));
    console.log("📊 RESUMO DOS TESTES");
    console.log("=".repeat(70) + "\n");
    
    console.log(`✅ Testes Passados: ${testResults.passed.length}`);
    console.log(`❌ Testes Falhados: ${testResults.failed.length}`);
    console.log(`⚠️  Warnings: ${testResults.warnings.length}`);
    
    if (testResults.failed.length > 0) {
        console.log("\n❌ TESTES FALHADOS:");
        testResults.failed.forEach(test => {
            console.log(`   - ${test.name}: ${test.details}`);
        });
    }
    
    if (testResults.warnings.length > 0) {
        console.log("\n⚠️  WARNINGS:");
        testResults.warnings.forEach(warning => {
            console.log(`   - ${warning}`);
        });
    }
    
    console.log("\n" + "=".repeat(70));
    
    if (testResults.failed.length === 0) {
        console.log("🎉 TODOS OS TESTES PASSARAM!");
        console.log("✅ V2 está pronto para deploy na MAINNET");
    } else {
        console.log("❌ ALGUNS TESTES FALHARAM");
        console.log("⚠️  NÃO FAÇA DEPLOY NA MAINNET ATÉ CORRIGIR");
    }
    
    console.log("=".repeat(70) + "\n");
    
    // Save test results
    const testResultsPath = path.join(__dirname, '../deployments/arbitrum-sepolia/test-results-v2.json');
    fs.writeFileSync(testResultsPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        network: "arbitrum-sepolia",
        factory: FACTORY_ADDRESS,
        testSeries: seriesAddress,
        results: testResults
    }, null, 2));
    
    console.log("💾 Resultados salvos em: deployments/arbitrum-sepolia/test-results-v2.json\n");
}

main()
    .then(() => process.exit(testResults.failed.length === 0 ? 0 : 1))
    .catch((error) => {
        console.error("\n❌ Testes falharam com erro crítico:", error);
        process.exit(1);
    });
