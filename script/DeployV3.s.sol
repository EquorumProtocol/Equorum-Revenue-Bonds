// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/v3/FeeSplitter.sol";
import "../contracts/v3/EquorumRegistry.sol";
import "../contracts/v3/TapBondFactory.sol";

/**
 * Deploy Equorum V3.
 *
 *   TREASURY=0x...  (multisig — final owner of registry + factory, receives 80% of fees)
 *   BUILDER=0x...   (receives 20% of fees)
 *   DRAW_FEE_BPS=200 (optional, default 2%, max 300)
 *
 *   forge script script/DeployV3.s.sol --rpc-url $ARBITRUM_SEPOLIA_RPC --broadcast
 *
 * After deploy the multisig must call `EquorumRegistry.acceptOwnership()` (Ownable2Step).
 */
contract DeployV3 is Script {
    function run() external {
        address treasury = vm.envAddress("TREASURY");
        address builder = vm.envAddress("BUILDER");
        uint256 fee = vm.envOr("DRAW_FEE_BPS", uint256(200));

        vm.startBroadcast();
        address deployer = msg.sender;

        FeeSplitter splitter = new FeeSplitter(treasury, builder);
        EquorumRegistry registry = new EquorumRegistry(deployer);
        TapBondFactory factory = new TapBondFactory(treasury, address(splitter), registry, fee);

        registry.setFactory(address(factory), true);
        registry.transferOwnership(treasury); // pending until the multisig accepts

        vm.stopBroadcast();

        console.log("FeeSplitter     ", address(splitter));
        console.log("EquorumRegistry ", address(registry));
        console.log("TapBondFactory  ", address(factory));
        console.log("Draw fee (bps)  ", fee);
        console.log("NEXT: multisig must call registry.acceptOwnership()");
    }
}
