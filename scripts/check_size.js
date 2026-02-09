const path = require("path");
const base = path.join(__dirname, "../artifacts/contracts");

const contracts = [
    ["Factory (deployed)", "v2/core/RevenueBondEscrowFactory.sol/RevenueBondEscrowFactory.json", "deployed"],
    ["Factory (creation)", "v2/core/RevenueBondEscrowFactory.sol/RevenueBondEscrowFactory.json", "creation"],
    ["Escrow (deployed)", "v2/core/RevenueBondEscrow.sol/RevenueBondEscrow.json", "deployed"],
    ["Escrow (creation)", "v2/core/RevenueBondEscrow.sol/RevenueBondEscrow.json", "creation"],
    ["Router (deployed)", "v2/core/RevenueRouter.sol/RevenueRouter.json", "deployed"],
    ["Router (creation)", "v2/core/RevenueRouter.sol/RevenueRouter.json", "creation"],
    ["Viewer (deployed)", "v2/core/FactoryViewer.sol/FactoryViewer.json", "deployed"],
    ["EscrowDeployer (deployed)", "v2/core/EscrowDeployer.sol/EscrowDeployer.json", "deployed"],
    ["RouterDeployer (deployed)", "v2/core/RouterDeployer.sol/RouterDeployer.json", "deployed"],
];

console.log("=== Contract Size Analysis ===");
console.log("Limit: 24,576 bytes\n");

for (const [name, file, type] of contracts) {
    try {
        const a = require(path.join(base, file));
        const bc = type === "deployed" ? a.deployedBytecode : a.bytecode;
        const size = (bc.length - 2) / 2;
        const status = size <= 24576 ? "OK" : "OVER by " + (size - 24576);
        console.log(`${name.padEnd(25)} ${String(size).padStart(6)} bytes  ${status}`);
    } catch(e) { console.log(`${name.padEnd(25)} NOT FOUND`); }
}
