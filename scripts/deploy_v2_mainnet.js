// ============================================
// DEPLOY V2 COMPLETE - ARBITRUM ONE (MAINNET)
// ============================================
// Deploys ALL V2 contracts:
//   1. ProtocolReputationRegistry
//   2. RevenueSeriesFactory (Soft Bonds)
//   3. EscrowDeployer
//   4. RouterDeployer
//   5. RevenueBondEscrowFactory (Guaranteed Bonds)
//   6. Configure: authorize factories in registry, transfer deployer ownership
//   7. Transfer ownership of ALL contracts to Safe multisig
//   8. Verification: read back all state to confirm correctness
//
// Same pattern as deploy_v2_testnet.js but with:
//   - Safe multisig as treasury and final owner
//   - Chain verification (must be Arbitrum One 42161)
//   - 10 second confirmation delay
//   - Ownership transfer to Safe after deploy

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Safe multisig (owner + treasury)
const SAFE_ADDRESS = "0xBa69aEd75E8562f9D23064aEBb21683202c5279B";

async function main() {
    console.log("\n" + "=".repeat(70));
    console.log("  REVENUE BONDS V2 - FULL DEPLOY TO ARBITRUM ONE (MAINNET)");
    console.log("=".repeat(70) + "\n");

    const [deployer] = await hre.ethers.getSigners();
    const network = await hre.ethers.provider.getNetwork();

    console.log("WARNING: DEPLOYING TO MAINNET!");
    console.log("Deployer:", deployer.address);
    console.log("Network:", network.name, "(chainId:", network.chainId.toString(), ")");

    // Chain verification
    if (network.chainId !== 42161n) {
        throw new Error("Not on Arbitrum One! ChainId: " + network.chainId.toString());
    }

    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("Balance:", hre.ethers.formatEther(balance), "ETH");
    console.log("Treasury/Owner (Safe):", SAFE_ADDRESS);

    if (balance < hre.ethers.parseEther("0.005")) {
        throw new Error("Insufficient balance. Need at least 0.005 ETH for deploy.");
    }

    console.log("\nConfiguration:");
    console.log("  Treasury: " + SAFE_ADDRESS + " (Safe multisig)");
    console.log("  Fees: disabled (policies = address(0))");
    console.log("  Ownership: will transfer to Safe after deploy");
    console.log("\nPress Ctrl+C to cancel, or wait 10 seconds to continue...\n");

    await new Promise(resolve => setTimeout(resolve, 10000));
    console.log("Starting deployment...\n");

    const gasUsed = {};
    const txHashes = {};

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
    txHashes.registry = registryReceipt.hash;
    console.log("  ProtocolReputationRegistry:", registryAddress);
    console.log("  Gas:", gasUsed.registry, "Tx:", txHashes.registry, "\n");

    // ============================================
    // 2. DEPLOY REVENUE SERIES FACTORY (Soft Bonds)
    // ============================================
    console.log("[2/5] Deploying RevenueSeriesFactory...");

    const RevenueSeriesFactory = await hre.ethers.getContractFactory(
        "contracts/v2/core/RevenueSeriesFactory.sol:RevenueSeriesFactory"
    );
    const softFactory = await RevenueSeriesFactory.deploy(SAFE_ADDRESS, registryAddress);
    await softFactory.waitForDeployment();
    const softFactoryAddress = await softFactory.getAddress();

    const softFactoryReceipt = await softFactory.deploymentTransaction().wait();
    gasUsed.softFactory = softFactoryReceipt.gasUsed.toString();
    txHashes.softFactory = softFactoryReceipt.hash;
    console.log("  RevenueSeriesFactory:", softFactoryAddress);
    console.log("  Gas:", gasUsed.softFactory, "Tx:", txHashes.softFactory, "\n");

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
    txHashes.escrowDeployer = escrowDeployerReceipt.hash;
    console.log("  EscrowDeployer:", escrowDeployerAddress);
    console.log("  Gas:", gasUsed.escrowDeployer, "Tx:", txHashes.escrowDeployer, "\n");

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
    txHashes.routerDeployer = routerDeployerReceipt.hash;
    console.log("  RouterDeployer:", routerDeployerAddress);
    console.log("  Gas:", gasUsed.routerDeployer, "Tx:", txHashes.routerDeployer, "\n");

    // ============================================
    // 5. DEPLOY ESCROW FACTORY (Guaranteed Bonds)
    // ============================================
    console.log("[5/5] Deploying RevenueBondEscrowFactory...");

    const RevenueBondEscrowFactory = await hre.ethers.getContractFactory(
        "contracts/v2/core/RevenueBondEscrowFactory.sol:RevenueBondEscrowFactory"
    );
    const escrowFactory = await RevenueBondEscrowFactory.deploy(
        SAFE_ADDRESS,
        registryAddress,
        escrowDeployerAddress,
        routerDeployerAddress
    );
    await escrowFactory.waitForDeployment();
    const escrowFactoryAddress = await escrowFactory.getAddress();

    const escrowFactoryReceipt = await escrowFactory.deploymentTransaction().wait();
    gasUsed.escrowFactory = escrowFactoryReceipt.gasUsed.toString();
    txHashes.escrowFactory = escrowFactoryReceipt.hash;
    console.log("  RevenueBondEscrowFactory:", escrowFactoryAddress);
    console.log("  Gas:", gasUsed.escrowFactory, "Tx:", txHashes.escrowFactory, "\n");

    // ============================================
    // 6. CONFIGURE - Authorize & Transfer Deployer Ownership
    // ============================================
    console.log("Configuring...\n");

    // 6a. Authorize Soft Factory in Registry
    console.log("  - Authorizing RevenueSeriesFactory in Registry...");
    let tx = await registry.authorizeReporter(softFactoryAddress);
    let receipt = await tx.wait();
    txHashes.authSoftFactory = receipt.hash;
    console.log("    Done (Tx:", receipt.hash, ")");

    // 6b. Authorize Escrow Factory in Registry
    console.log("  - Authorizing RevenueBondEscrowFactory in Registry...");
    tx = await registry.authorizeReporter(escrowFactoryAddress);
    receipt = await tx.wait();
    txHashes.authEscrowFactory = receipt.hash;
    console.log("    Done (Tx:", receipt.hash, ")");

    // 6c. Transfer EscrowDeployer ownership to EscrowFactory
    console.log("  - Transferring EscrowDeployer ownership to EscrowFactory...");
    tx = await escrowDeployer.transferOwnership(escrowFactoryAddress);
    receipt = await tx.wait();
    txHashes.escrowDeployerOwnership = receipt.hash;
    console.log("    Done (Tx:", receipt.hash, ")");

    // 6d. Transfer RouterDeployer ownership to EscrowFactory
    console.log("  - Transferring RouterDeployer ownership to EscrowFactory...");
    tx = await routerDeployer.transferOwnership(escrowFactoryAddress);
    receipt = await tx.wait();
    txHashes.routerDeployerOwnership = receipt.hash;
    console.log("    Done (Tx:", receipt.hash, ")");

    // ============================================
    // 7. TRANSFER OWNERSHIP TO SAFE
    // ============================================
    console.log("\n  Transferring ownership to Safe multisig...\n");

    // 7a. Transfer RevenueSeriesFactory ownership to Safe
    console.log("  - RevenueSeriesFactory ownership -> Safe...");
    tx = await softFactory.transferOwnership(SAFE_ADDRESS);
    receipt = await tx.wait();
    txHashes.softFactoryOwnership = receipt.hash;
    console.log("    Done (Tx:", receipt.hash, ")");

    // 7b. Transfer RevenueBondEscrowFactory ownership to Safe
    console.log("  - RevenueBondEscrowFactory ownership -> Safe...");
    tx = await escrowFactory.transferOwnership(SAFE_ADDRESS);
    receipt = await tx.wait();
    txHashes.escrowFactoryOwnership = receipt.hash;
    console.log("    Done (Tx:", receipt.hash, ")");

    // 7c. Transfer ProtocolReputationRegistry ownership to Safe
    console.log("  - ProtocolReputationRegistry ownership -> Safe...");
    tx = await registry.transferOwnership(SAFE_ADDRESS);
    receipt = await tx.wait();
    txHashes.registryOwnership = receipt.hash;
    console.log("    Done (Tx:", receipt.hash, ")\n");

    // ============================================
    // 8. VERIFY - Read back all state
    // ============================================
    console.log("Verifying deployment...\n");

    // Soft Factory verification
    const sfTreasury = await softFactory.treasury();
    const sfRegistry = await softFactory.reputationRegistry();
    const sfOwner = await softFactory.owner();
    const sfPolicies = await softFactory.getPolicies();
    const sfLimits = await softFactory.getSafetyLimits();
    const sfPaused = await softFactory.paused();

    console.log("  RevenueSeriesFactory:");
    console.log("    owner:", sfOwner, sfOwner === SAFE_ADDRESS ? "(Safe - correct)" : "(WRONG!)");
    console.log("    treasury:", sfTreasury, sfTreasury === SAFE_ADDRESS ? "(Safe - correct)" : "(WRONG!)");
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
    const efOwner = await escrowFactory.owner();
    const efEscrowDeployer = await escrowFactory.escrowDeployer();
    const efRouterDeployer = await escrowFactory.routerDeployer();
    const efPaused = await escrowFactory.paused();
    const efLimits = await escrowFactory.limits();

    console.log("  RevenueBondEscrowFactory:");
    console.log("    owner:", efOwner, efOwner === SAFE_ADDRESS ? "(Safe - correct)" : "(WRONG!)");
    console.log("    treasury:", efTreasury, efTreasury === SAFE_ADDRESS ? "(Safe - correct)" : "(WRONG!)");
    console.log("    reputationRegistry:", efRegistry);
    console.log("    escrowDeployer:", efEscrowDeployer);
    console.log("    routerDeployer:", efRouterDeployer);
    console.log("    maxShareBPS:", efLimits[0].toString(), "(" + (Number(efLimits[0]) / 100) + "%)");
    console.log("    minDurationDays:", efLimits[1].toString());
    console.log("    maxDurationDays:", efLimits[2].toString());
    console.log("    minSupply:", hre.ethers.formatEther(efLimits[3]), "tokens");
    console.log("    paused:", efPaused, "\n");

    // Registry verification
    const regOwner = await registry.owner();
    const sfAuthorized = await registry.authorizedReporters(softFactoryAddress);
    const efAuthorized = await registry.authorizedReporters(escrowFactoryAddress);
    console.log("  ProtocolReputationRegistry:");
    console.log("    owner:", regOwner, regOwner === SAFE_ADDRESS ? "(Safe - correct)" : "(WRONG!)");
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
    if (sfOwner !== SAFE_ADDRESS) errors.push("SoftFactory owner not Safe");
    if (sfTreasury !== SAFE_ADDRESS) errors.push("SoftFactory treasury not Safe");
    if (sfRegistry !== registryAddress) errors.push("SoftFactory registry mismatch");
    if (efOwner !== SAFE_ADDRESS) errors.push("EscrowFactory owner not Safe");
    if (efTreasury !== SAFE_ADDRESS) errors.push("EscrowFactory treasury not Safe");
    if (efRegistry !== registryAddress) errors.push("EscrowFactory registry mismatch");
    if (efEscrowDeployer !== escrowDeployerAddress) errors.push("EscrowFactory escrowDeployer mismatch");
    if (efRouterDeployer !== routerDeployerAddress) errors.push("EscrowFactory routerDeployer mismatch");
    if (regOwner !== SAFE_ADDRESS) errors.push("Registry owner not Safe");
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

    // Deployer has NO power after this point
    console.log("  Deployer (" + deployer.address + ") has NO power after deploy.");
    console.log("  Safe (" + SAFE_ADDRESS + ") controls everything.\n");

    // ============================================
    // 9. SAVE DEPLOYMENT INFO
    // ============================================
    const deploymentInfo = {
        version: "v2",
        network: "arbitrum-one",
        chainId: 42161,
        timestamp: new Date().toISOString(),
        deployer: deployer.address,
        owner: SAFE_ADDRESS,
        treasury: SAFE_ADDRESS,
        contracts: {
            protocolReputationRegistry: registryAddress,
            revenueSeriesFactory: softFactoryAddress,
            escrowDeployer: escrowDeployerAddress,
            routerDeployer: routerDeployerAddress,
            revenueBondEscrowFactory: escrowFactoryAddress,
        },
        configuration: {
            softFactory: {
                owner: sfOwner,
                treasury: sfTreasury,
                reputationRegistry: sfRegistry,
                feePolicy: sfPolicies[0],
                safetyPolicy: sfPolicies[1],
                accessPolicy: sfPolicies[2],
                paused: sfPaused,
            },
            escrowFactory: {
                owner: efOwner,
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
        transactions: txHashes,
        gasUsed,
    };

    const deploymentsDir = path.join(__dirname, "../deployments/arbitrum-mainnet");
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

    console.log("Deployment saved to: deployments/arbitrum-mainnet/" + filename);

    // ============================================
    // SUMMARY
    // ============================================
    console.log("\n" + "=".repeat(70));
    console.log("  V2 DEPLOYMENT COMPLETE ON ARBITRUM ONE (MAINNET)!");
    console.log("=".repeat(70));
    console.log("\n  Contract Addresses:");
    console.log("    ProtocolReputationRegistry:", registryAddress);
    console.log("    RevenueSeriesFactory:      ", softFactoryAddress);
    console.log("    EscrowDeployer:            ", escrowDeployerAddress);
    console.log("    RouterDeployer:            ", routerDeployerAddress);
    console.log("    RevenueBondEscrowFactory:  ", escrowFactoryAddress);
    console.log("\n  Owner/Treasury: " + SAFE_ADDRESS + " (Safe multisig)");
    console.log("  Deployer power: NONE (ownership transferred)");
    console.log("\n  Arbiscan:");
    console.log("    https://arbiscan.io/address/" + softFactoryAddress);
    console.log("    https://arbiscan.io/address/" + escrowFactoryAddress);
    console.log("\n  Update frontend web3.js:");
    console.log("    FACTORY_ADDRESS = '" + softFactoryAddress + "'");
    console.log("    ESCROW_FACTORY_ADDRESS = '" + escrowFactoryAddress + "'");
    console.log("\n  Verify on Arbiscan:");
    console.log("    npx hardhat verify --network arbitrum " + registryAddress);
    console.log("    npx hardhat verify --network arbitrum " + softFactoryAddress + " " + SAFE_ADDRESS + " " + registryAddress);
    console.log("    npx hardhat verify --network arbitrum " + escrowDeployerAddress);
    console.log("    npx hardhat verify --network arbitrum " + routerDeployerAddress);
    console.log("    npx hardhat verify --network arbitrum " + escrowFactoryAddress + " " + SAFE_ADDRESS + " " + registryAddress + " " + escrowDeployerAddress + " " + routerDeployerAddress);
    console.log("\n");

    return deploymentInfo;
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\nDeployment failed:", error.message || error);
        process.exit(1);
    });
