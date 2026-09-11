// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/v3/FeeSplitter.sol";
import "../contracts/v3/EquorumRegistry.sol";
import "../contracts/v3/TapBondFactory.sol";

/**
 * Deploy Equorum V3.
 *
 * Env (all optional on testnet — default to the deployer address):
 *   TREASURY      multisig: final owner of registry + factory, receives 80% of fees
 *   BUILDER       receives 20% of fees
 *   DRAW_FEE_BPS  default 200 (2%), max 300
 *
 * Testnet:
 *   forge script script/DeployV3.s.sol --rpc-url arbitrum_sepolia --account deployer --broadcast --verify
 *
 * If TREASURY != deployer, the multisig must later call EquorumRegistry.acceptOwnership() (Ownable2Step).
 */
contract DeployV3 is Script {
    function run() external {
        vm.startBroadcast();
        // The actual broadcasting account (works with --account, --private-key or --ledger).
        (, address deployer,) = vm.readCallers();

        address treasury = vm.envOr("TREASURY", deployer);
        address builder = vm.envOr("BUILDER", deployer);
        uint256 fee = vm.envOr("DRAW_FEE_BPS", uint256(200));

        FeeSplitter splitter = new FeeSplitter(treasury, builder);
        EquorumRegistry registry = new EquorumRegistry(deployer);
        TapBondFactory factory = new TapBondFactory(treasury, address(splitter), registry, fee);

        registry.setFactory(address(factory), true);
        if (treasury != deployer) {
            registry.transferOwnership(treasury); // pending until the multisig accepts
        }

        vm.stopBroadcast();

        console.log("Chain id        ", block.chainid);
        console.log("Deployer        ", deployer);
        console.log("Treasury (80%)  ", treasury);
        console.log("Builder  (20%)  ", builder);
        console.log("Draw fee (bps)  ", fee);
        console.log("");
        console.log("FeeSplitter     ", address(splitter));
        console.log("EquorumRegistry ", address(registry));
        console.log("TapBondFactory  ", address(factory));
        if (treasury != deployer) console.log("NEXT: multisig must call registry.acceptOwnership()");
    }
}
