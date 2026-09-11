// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/v3/TapBond.sol";
import "../contracts/v3/TapRouter.sol";
import "../contracts/v3/TapBondFactory.sol";
import "../contracts/v3/FeeSplitter.sol";

/**
 * End-to-end smoke test on a live network, using tiny amounts (~0.011 ETH, mostly returned).
 * The deployer plays issuer AND buyer, so no second wallet is needed.
 *
 *   FACTORY=0x... forge script script/SmokeV3.s.sol --rpc-url arbitrum_sepolia --account deployer --broadcast
 *
 * Flow: create bond (0.001 ETH collateral) -> buy 1000 tokens (0.01 ETH) -> issuer closes sale early
 *       -> draw 25% initial release (2% fee to FeeSplitter) -> pay one coupon -> route revenue -> claim.
 * Default / maturity need real days to pass (epochs are >= 1 day) and are covered by `forge test`.
 */
contract SmokeV3 is Script {
    function run() external {
        TapBondFactory factory = TapBondFactory(vm.envAddress("FACTORY"));

        TapBond.Terms memory t;
        t.price = 0.00001 ether; // per token
        t.maxSupply = 1_000e18; // max raise 0.01 ETH
        t.minRaise = 0.005 ether;
        t.saleDuration = 1 days;
        t.epochDuration = 1 days;
        t.gracePeriod = 1 days;
        t.numEpochs = 10;
        t.tapEpochs = 2;
        t.couponBps = 1100; // 10 x 11% = 1.1x
        t.initialReleaseBps = 2500;
        t.revenueShareBps = 2000;

        vm.startBroadcast();
        (, address me,) = vm.readCallers();

        (address b, address r) = factory.createBond{value: 0.001 ether}("Equorum Smoke Test", "EQ-SMOKE", t);
        TapBond bond = TapBond(payable(b));
        TapRouter router = TapRouter(payable(r));

        bond.buy{value: 0.01 ether}(1_000e18);
        bond.finalize(); // sold out
        uint256 net = bond.drawCapital(me);

        bond.distribute{value: bond.couponAmount()}(); // one coupon (0.0011 ETH)
        (bool ok,) = address(router).call{value: 0.001 ether}("");
        require(ok, "router send failed");
        router.route(); // 20% to holders, 80% booked for issuer
        router.withdrawIssuer();
        uint256 claimed = bond.claimRevenue();

        vm.stopBroadcast();

        FeeSplitter splitter = FeeSplitter(payable(factory.feeRecipient()));
        console.log("TapBond         ", address(bond));
        console.log("TapRouter       ", address(router));
        console.log("state (1=Active)", uint256(bond.state()));
        console.log("raised (wei)    ", bond.raised());
        console.log("drawn net (wei) ", net);
        console.log("epochsCovered   ", bond.epochsCovered());
        console.log("claimed (wei)   ", claimed);
        console.log("splitter owed treasury/builder (wei):");
        console.log(splitter.treasuryOwed(), splitter.builderOwed());

        require(bond.state() == TapBond.State.Active, "not active");
        require(bond.epochsCovered() == 1, "coupon not counted");
        require(claimed > 0, "nothing claimed");
        console.log("SMOKE TEST PASSED");
    }
}
