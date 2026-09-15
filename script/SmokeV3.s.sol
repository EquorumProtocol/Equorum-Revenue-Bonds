// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/v3/TapBond.sol";
import "../contracts/v3/TapRouter.sol";
import "../contracts/v3/TapBondFactory.sol";
import "../contracts/v3/FeeSplitter.sol";

/**
 * End-to-end smoke test on a live network. The deployer plays issuer AND buyer, so no
 * second wallet is needed. Sized for a thin testnet wallet: about 0.0013 ETH leaves the
 * wallet, most of it claimed straight back, the rest escrowed until the term ends.
 *
 *   FACTORY=0x... forge script script/SmokeV3.s.sol --rpc-url arbitrum_sepolia --account deployer --broadcast
 *
 * Flow: create bond (COLLATERAL) -> buy the whole sale (TOKENS x PRICE) -> issuer closes early
 *       -> draw 25% initial release (2% fee to FeeSplitter) -> pay one coupon -> route revenue -> claim.
 * Default / maturity need real days to pass (epochs are >= 1 day) and are covered by `forge test`.
 */
contract SmokeV3 is Script {
    // Everything this run spends, in one place. Scale the numbers together to test with
    // more value; the flow only depends on the ratios between them.
    uint256 constant TOKENS = 1_000e18;         // the whole sale, bought by the deployer
    uint256 constant PRICE = 0.000001 ether;    // per token -> raise of 0.001 ETH
    uint256 constant COLLATERAL = 0.0001 ether; // locked until maturity or default
    uint256 constant REVENUE = 0.0001 ether;    // extra revenue pushed through the router

    function run() external {
        TapBondFactory factory = TapBondFactory(vm.envAddress("FACTORY"));
        uint256 raise = TOKENS * PRICE / 1e18;

        TapBond.Terms memory t;
        t.price = PRICE;
        t.maxSupply = TOKENS;
        t.minRaise = raise / 2;
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

        (address b, address r) = factory.createBond{value: COLLATERAL}("Equorum Smoke Test", "EQ-SMOKE", t);
        TapBond bond = TapBond(payable(b));
        TapRouter router = TapRouter(payable(r));

        bond.buy{value: raise}(TOKENS);
        bond.finalize(); // sold out
        uint256 net = bond.drawCapital(me);

        bond.distribute{value: bond.couponAmount()}(); // one coupon
        (bool ok,) = address(router).call{value: REVENUE}("");
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
