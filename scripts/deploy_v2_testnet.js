// ============================================
// DEPLOY V2 COMPLETE - ARBITRUM SEPOLIA (TESTNET)
// ============================================
// Deploys ALL V2 contracts:
//   1. ProtocolReputationRegistry
//   2. RevenueSeriesFactory (Soft Bonds)
//   3. EscrowDeployer
//   4. RouterDeployer
//   5. RevenueBondEscrowFactory (Guaranteed Bonds)
//   6. Configure: authorize factories in registry, transfer deployer ownership
//   7. Verification: read back all state to confirm correctness
//   8. Create demo series on each factory to validate end-to-end

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("\n" + "=".repeat(70));
    console.log("  REVENUE BONDS V2 - FULL DEPLOY TO ARBITRUM SEPOLIA");
    console.log("=".repeat(70) + "\n");

    const [deployer] = await hre.ethers.getSigners();
    const network = await hre.ethers.provider.getNetwork();

    console.log("Deployer:", deployer.address);
    console.log("Network:", network.name, "(chainId:", network.chainId.toString(), ")");

    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("Balance:", hre.ethers.formatEther(balance), "ETH\n");

    if (balance < hre.ethers.parseEther("0.005")) {
        throw new Error("Insufficient balance. Need at least 0.005 ETH for deploy.");
    }

    // Treasury = deployer for testnet
    const TREASURY = deployer.address;
    console.log("Treasury:", TREASURY, "(deployer for testnet)\n");

    const gasUsed = {};

    // ============================================
    // 1. DEPLOY REPUTATION REGISTRY
    // ============================================
    console.log("[1/5] Deploying ProtocolReputationRegistry...");

    const ProtocolReputationRegistry = await hre.ethers.getContractFactory(
        "contracts/v2/registry/ProtocolReputationRegistry.sol:ProtocolReputationRegistry"
    );
    const registry = await ProtocolReputationRegistry.deploy();
    await registry.waitForDeployment();
    const registryAddress = await registry.getAddress();

    const registryReceipt = await registry.deploymentTransaction().wait();
    gasUsed.registry = registryReceipt.gasUsed.toString();
    console.log("  ProtocolReputationRegistry:", registryAddress);
    console.log("  Gas:", gasUsed.registry, "\n");

    // ============================================
    // 2. DEPLOY REVENUE SERIES FACTORY (Soft Bonds)
    // ============================================
    console.log("[2/5] Deploying RevenueSeriesFactory...");

    const RevenueSeriesFactory = await hre.ethers.getContractFactory(
        "contracts/v2/core/RevenueSeriesFactory.sol:RevenueSeriesFactory"
    );
    const softFactory = await RevenueSeriesFactory.deploy(TREASURY, registryAddress);
    await softFactory.waitForDeployment();
    const softFactoryAddress = await softFactory.getAddress();

    const softFactoryReceipt = await softFactory.deploymentTransaction().wait();
    gasUsed.softFactory = softFactoryReceipt.gasUsed.toString();
    console.log("  RevenueSeriesFactory:", softFactoryAddress);
    console.log("  Gas:", gasUsed.softFactory, "\n");

    // ============================================
    // 3. DEPLOY ESCROW DEPLOYER
    // ============================================
    console.log("[3/5] Deploying EscrowDeployer...");

    const EscrowDeployer = await hre.ethers.getContractFactory(
        "contracts/v2/core/EscrowDeployer.sol:EscrowDeployer"
    );
    const escrowDeployer = await EscrowDeployer.deploy();
    await escrowDeployer.waitForDeployment();
    const escrowDeployerAddress = await escrowDeployer.getAddress();

    const escrowDeployerReceipt = await escrowDeployer.deploymentTransaction().wait();
    gasUsed.escrowDeployer = escrowDeployerReceipt.gasUsed.toString();
    console.log("  EscrowDeployer:", escrowDeployerAddress);
    console.log("  Gas:", gasUsed.escrowDeployer, "\n");

    // ============================================
    // 4. DEPLOY ROUTER DEPLOYER
    // ============================================
    console.log("[4/5] Deploying RouterDeployer...");

    const RouterDeployer = await hre.ethers.getContractFactory(
        "contracts/v2/core/RouterDeployer.sol:RouterDeployer"
    );
    const routerDeployer = await RouterDeployer.deploy();
    await routerDeployer.waitForDeployment();
    const routerDeployerAddress = await routerDeployer.getAddress();

    const routerDeployerReceipt = await routerDeployer.deploymentTransaction().wait();
    gasUsed.routerDeployer = routerDeployerReceipt.gasUsed.toString();
    console.log("  RouterDeployer:", routerDeployerAddress);
    console.log("  Gas:", gasUsed.routerDeployer, "\n");

    // ============================================
    // 5. DEPLOY ESCROW FACTORY (Guaranteed Bonds)
    // ============================================
    console.log("[5/5] Deploying RevenueBondEscrowFactory...");

    const RevenueBondEscrowFactory = await hre.ethers.getContractFactory(
        "contracts/v2/core/RevenueBondEscrowFactory.sol:RevenueBondEscrowFactory"
    );
    const escrowFactory = await RevenueBondEscrowFactory.deploy(
        TREASURY,
        registryAddress,
        escrowDeployerAddress,
        routerDeployerAddress
    );
    await escrowFactory.waitForDeployment();
    const escrowFactoryAddress = await escrowFactory.getAddress();

    const escrowFactoryReceipt = await escrowFactory.deploymentTransaction().wait();
    gasUsed.escrowFactory = escrowFactoryReceipt.gasUsed.toString();
    console.log("  RevenueBondEscrowFactory:", escrowFactoryAddress);
    console.log("  Gas:", gasUsed.escrowFactory, "\n");

    // ============================================
    // 6. CONFIGURE - Authorize & Transfer Ownership
    // ============================================
    console.log("Configuring...\n");

    // 6a. Authorize Soft Factory in Registry
    console.log("  - Authorizing RevenueSeriesFactory in Registry...");
    let tx = await registry.authorizeReporter(softFactoryAddress);
    await tx.wait();
    console.log("    Done");

    // 6b. Authorize Escrow Factory in Registry
    console.log("  - Authorizing RevenueBondEscrowFactory in Registry...");
    tx = await registry.authorizeReporter(escrowFactoryAddress);
    await tx.wait();
    console.log("    Done");

    // 6c. Transfer EscrowDeployer ownership to EscrowFactory
    console.log("  - Transferring EscrowDeployer ownership to EscrowFactory...");
    tx = await escrowDeployer.transferOwnership(escrowFactoryAddress);
    await tx.wait();
    console.log("    Done");

    // 6d. Transfer RouterDeployer ownership to EscrowFactory
    console.log("  - Transferring RouterDeployer ownership to EscrowFactory...");
    tx = await routerDeployer.transferOwnership(escrowFactoryAddress);
    await tx.wait();
    console.log("    Done\n");

    // ============================================
    // 7. VERIFY - Read back all state
    // ============================================
    console.log("Verifying deployment...\n");

    // Soft Factory verification
    const sfTreasury = await softFactory.treasury();
    const sfRegistry = await softFactory.reputationRegistry();
    const sfPolicies = await softFactory.getPolicies();
    const sfLimits = await softFactory.getSafetyLimits();
    const sfPaused = await softFactory.paused();

    console.log("  RevenueSeriesFactory:");
    console.log("    treasury:", sfTreasury);
    console.log("    reputationRegistry:", sfRegistry);
    console.log("    feePolicy:", sfPolicies[0], sfPolicies[0] === hre.ethers.ZeroAddress ? "(disabled)" : "");
    console.log("    safetyPolicy:", sfPolicies[1], sfPolicies[1] === hre.ethers.ZeroAddress ? "(disabled)" : "");
    console.log("    accessPolicy:", sfPolicies[2], sfPolicies[2] === hre.ethers.ZeroAddress ? "(permissionless)" : "");
    console.log("    maxShareBPS:", sfLimits[0].toString(), "(" + (Number(sfLimits[0]) / 100) + "%)");
    console.log("    minDurationDays:", sfLimits[1].toString());
    console.log("    maxDurationDays:", sfLimits[2].toString());
    console.log("    minSupply:", hre.ethers.formatEther(sfLimits[3]), "tokens");
    console.log("    paused:", sfPaused, "\n");

    // Escrow Factory verification
    const efTreasury = await escrowFactory.treasury();
    const efRegistry = await escrowFactory.reputationRegistry();
    const efEscrowDeployer = await escrowFactory.escrowDeployer();
    const efRouterDeployer = await escrowFactory.routerDeployer();
    const efPaused = await escrowFactory.paused();
    const efLimits = await escrowFactory.limits();

    console.log("  RevenueBondEscrowFactory:");
    console.log("    treasury:", efTreasury);
    console.log("    reputationRegistry:", efRegistry);
    console.log("    escrowDeployer:", efEscrowDeployer);
    console.log("    routerDeployer:", efRouterDeployer);
    console.log("    maxShareBPS:", efLimits[0].toString(), "(" + (Number(efLimits[0]) / 100) + "%)");
    console.log("    minDurationDays:", efLimits[1].toString());
    console.log("    maxDurationDays:", efLimits[2].toString());
    console.log("    minSupply:", hre.ethers.formatEther(efLimits[3]), "tokens");
    console.log("    paused:", efPaused, "\n");

    // Registry verification
    const sfAuthorized = await registry.authorizedReporters(softFactoryAddress);
    const efAuthorized = await registry.authorizedReporters(escrowFactoryAddress);
    console.log("  ProtocolReputationRegistry:");
    console.log("    SoftFactory authorized:", sfAuthorized);
    console.log("    EscrowFactory authorized:", efAuthorized, "\n");

    // Deployer ownership verification
    const escrowDeployerOwner = await escrowDeployer.owner();
    const routerDeployerOwner = await routerDeployer.owner();
    console.log("  Deployer Ownership:");
    console.log("    EscrowDeployer owner:", escrowDeployerOwner, escrowDeployerOwner === escrowFactoryAddress ? "(correct)" : "(WRONG!)");
    console.log("    RouterDeployer owner:", routerDeployerOwner, routerDeployerOwner === escrowFactoryAddress ? "(correct)" : "(WRONG!)");

    // Assertions
    const errors = [];
    if (sfTreasury !== TREASURY) errors.push("SoftFactory treasury mismatch");
    if (sfRegistry !== registryAddress) errors.push("SoftFactory registry mismatch");
    if (efTreasury !== TREASURY) errors.push("EscrowFactory treasury mismatch");
    if (efRegistry !== registryAddress) errors.push("EscrowFactory registry mismatch");
    if (efEscrowDeployer !== escrowDeployerAddress) errors.push("EscrowFactory escrowDeployer mismatch");
    if (efRouterDeployer !== routerDeployerAddress) errors.push("EscrowFactory routerDeployer mismatch");
    if (!sfAuthorized) errors.push("SoftFactory not authorized in registry");
    if (!efAuthorized) errors.push("EscrowFactory not authorized in registry");
    if (escrowDeployerOwner !== escrowFactoryAddress) errors.push("EscrowDeployer ownership not transferred");
    if (routerDeployerOwner !== escrowFactoryAddress) errors.push("RouterDeployer ownership not transferred");
    if (sfPaused) errors.push("SoftFactory is paused");
    if (efPaused) errors.push("EscrowFactory is paused");

    if (errors.length > 0) {
        console.log("\n  VERIFICATION ERRORS:");
        errors.forEach(e => console.log("    - " + e));
        throw new Error("Deployment verification failed: " + errors.join(", "));
    }

    console.log("\n  All verifications passed!\n");

    // ============================================
    // 8. SAVE DEPLOYMENT INFO
    // ============================================
    const deploymentInfo = {
        version: "v2",
        network: "arbitrum-sepolia",
        chainId: Number(network.chainId),
        timestamp: new Date().toISOString(),
        deployer: deployer.address,
        treasury: TREASURY,
        contracts: {
            protocolReputationRegistry: registryAddress,
            revenueSeriesFactory: softFactoryAddress,
            escrowDeployer: escrowDeployerAddress,
            routerDeployer: routerDeployerAddress,
            revenueBondEscrowFactory: escrowFactoryAddress,
        },
        configuration: {
            softFactory: {
                treasury: sfTreasury,
                reputationRegistry: sfRegistry,
                feePolicy: sfPolicies[0],
                safetyPolicy: sfPolicies[1],
                accessPolicy: sfPolicies[2],
                paused: sfPaused,
            },
            escrowFactory: {
                treasury: efTreasury,
                reputationRegistry: efRegistry,
                escrowDeployer: efEscrowDeployer,
                routerDeployer: efRouterDeployer,
                paused: efPaused,
            },
        },
        safetyLimits: {
            maxRevenueShareBPS: sfLimits[0].toString(),
            minDurationDays: sfLimits[1].toString(),
            maxDurationDays: sfLimits[2].toString(),
            minTotalSupply: hre.ethers.formatEther(sfLimits[3]),
        },
        gasUsed,
    };

    const deploymentsDir = path.join(__dirname, "../deployments/arbitrum-sepolia");
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }

    const filename = `v2-deployment-${Date.now()}.json`;
    fs.writeFileSync(
        path.join(deploymentsDir, filename),
        JSON.stringify(deploymentInfo, null, 2)
    );
    fs.writeFileSync(
        path.join(deploymentsDir, "v2-deployment-latest.json"),
        JSON.stringify(deploymentInfo, null, 2)
    );

    console.log("Deployment saved to: deployments/arbitrum-sepolia/" + filename);

    // ============================================
    // SUMMARY
    // ============================================
    console.log("\n" + "=".repeat(70));
    console.log("  V2 DEPLOYMENT COMPLETE!");
    console.log("=".repeat(70));
    console.log("\n  Contract Addresses:");
    console.log("    ProtocolReputationRegistry:", registryAddress);
    console.log("    RevenueSeriesFactory:      ", softFactoryAddress);
    console.log("    EscrowDeployer:            ", escrowDeployerAddress);
    console.log("    RouterDeployer:            ", routerDeployerAddress);
    console.log("    RevenueBondEscrowFactory:  ", escrowFactoryAddress);
    console.log("\n  Arbiscan Sepolia:");
    console.log("    https://sepolia.arbiscan.io/address/" + softFactoryAddress);
    console.log("    https://sepolia.arbiscan.io/address/" + escrowFactoryAddress);
    console.log("\n  Update frontend web3.js:");
    console.log("    FACTORY_ADDRESS = '" + softFactoryAddress + "'");
    console.log("    ESCROW_FACTORY_ADDRESS = '" + escrowFactoryAddress + "'");
    console.log("\n");

    return deploymentInfo;
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\nDeployment failed:", error.message || error);
        process.exit(1);
    });
