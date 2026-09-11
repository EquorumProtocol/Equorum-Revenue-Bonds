// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Base.t.sol";

import {ProtocolReputationRegistry} from "../../contracts/v2/registry/ProtocolReputationRegistry.sol";
import {RevenueBondEscrowFactory} from "../../contracts/v2/core/RevenueBondEscrowFactory.sol";
import {RevenueBondEscrow} from "../../contracts/v2/core/RevenueBondEscrow.sol";
import {EscrowDeployer} from "../../contracts/v2/core/EscrowDeployer.sol";
import {RouterDeployer} from "../../contracts/v2/core/RouterDeployer.sol";
import {RevenueSeriesFactory} from "../../contracts/v2/core/RevenueSeriesFactory.sol";
import {RevenueSeries} from "../../contracts/v2/core/RevenueSeries.sol";
import {SimpleFeePolicy} from "../../contracts/v2/policies/SimpleFeePolicy.sol";

/**
 * Each test first PROVES the V2 issue against the real V2 contracts
 * (deployed exactly like scripts/deploy_v2_mainnet.js), then shows V3 behaviour.
 */
contract V2RegressionTest is Base {
    ProtocolReputationRegistry v2Registry;
    RevenueBondEscrowFactory v2EscrowFactory;
    RevenueSeriesFactory v2SoftFactory;

    function setUp() public override {
        super.setUp();
        // Mirror mainnet deploy: registry owned by the Safe, factories authorized as reporters.
        v2Registry = new ProtocolReputationRegistry();
        v2SoftFactory = new RevenueSeriesFactory(multisig, address(v2Registry));
        EscrowDeployer ed = new EscrowDeployer();
        RouterDeployer rd = new RouterDeployer();
        v2EscrowFactory = new RevenueBondEscrowFactory(multisig, address(v2Registry), address(ed), address(rd));
        v2Registry.authorizeReporter(address(v2SoftFactory));
        v2Registry.authorizeReporter(address(v2EscrowFactory));
        ed.transferOwnership(address(v2EscrowFactory));
        rd.transferOwnership(address(v2EscrowFactory));
        v2SoftFactory.transferOwnership(multisig);
        v2EscrowFactory.transferOwnership(multisig);
        v2Registry.transferOwnership(multisig);
    }

    function _v2Escrow(uint256 principal) internal returns (RevenueBondEscrow e) {
        vm.prank(issuer);
        (address s,) = v2EscrowFactory.createEscrowSeries(
            "V2 Escrow", "V2E", issuer, 2000, 180, 1_000e18, principal, 0.001 ether, 30
        );
        e = RevenueBondEscrow(payable(s));
    }

    // R-1 ---------------------------------------------------------------

    function test_R1_v2_defaultNeverReachesRegistry() public {
        RevenueBondEscrow e = _v2Escrow(10 ether);
        assertFalse(v2Registry.authorizedReporters(address(e)), "series never authorized");

        skip(31 days);
        e.declareDefault();
        assertEq(uint256(e.state()), 3, "V2 escrow is Defaulted");

        (,,,,,, bool blacklisted) = v2Registry.getProtocolStats(issuer);
        assertFalse(blacklisted, "V2 BUG: default silently not recorded");
    }

    function test_R1_v3_defaultRecorded() public {
        (TapBond bond,) = activeBond(0);
        skip(EPOCH + GRACE);
        bond.triggerDefault();
        assertEq(registry.getIssuerStats(issuer).bondsDefaulted, 1);
    }

    // R-2 ---------------------------------------------------------------

    function test_R2_v2_creationFeeBypassedWithZeroValue() public {
        SimpleFeePolicy policy = new SimpleFeePolicy(1 ether, multisig);
        vm.prank(multisig);
        v2EscrowFactory.setFeePolicy(address(policy));

        uint256 treasuryBefore = multisig.balance;
        _v2Escrow(10 ether); // msg.value = 0, fee quote = 1 ETH
        assertEq(multisig.balance, treasuryBefore, "V2 BUG: 1 ETH fee never charged");
    }

    function test_R2_v3_feeCannotBeSkipped() public {
        (TapBond bond,) = activeBond(0);
        vm.prank(issuer);
        bond.drawCapital(issuer);
        assertEq(address(splitter).balance, (25 ether * DRAW_FEE_BPS) / 10_000);
    }

    // R-3 ---------------------------------------------------------------

    function test_R3_v2_issuerRedirectsSaleFeeToItself() public {
        RevenueBondEscrow e = _v2Escrow(1 ether);
        vm.startPrank(issuer);
        e.depositPrincipal{value: 1 ether}();
        e.startSale(1 ether, issuer); // "treasury" = issuer
        vm.stopPrank();

        uint256 before = issuer.balance;
        vm.prank(alice);
        e.buyTokens{value: 10 ether}(10e18);
        assertEq(issuer.balance - before, 10 ether, "V2 BUG: issuer keeps 100%, protocol gets 0");
    }

    function test_R3_v3_feeRecipientImmutable() public {
        (TapBond bond,) = activeBond(0);
        assertEq(bond.feeRecipient(), address(splitter));
    }

    // R-4 ---------------------------------------------------------------

    function test_R4_v2_principalLockedForTokensReceivedAfterClaim() public {
        RevenueBondEscrow e = _v2Escrow(1 ether);
        vm.startPrank(issuer);
        e.depositPrincipal{value: 1 ether}();
        e.transfer(alice, 500e18);
        e.transfer(bob, 500e18);
        vm.stopPrank();

        skip(181 days);
        vm.prank(alice);
        e.claimPrincipal();

        vm.prank(bob);
        e.transfer(alice, 500e18); // alice buys bob's position after maturity

        vm.prank(alice);
        vm.expectRevert("Already claimed");
        e.claimPrincipal();

        vm.expectRevert("Tokens still exist");
        e.rescueDustPrincipal();
        assertEq(address(e).balance, 0.5 ether, "V2 BUG: 0.5 ETH locked forever");
    }

    function test_R4_v3_redeemTokensReceivedLater() public {
        (TapBond bond,) = activeBond(0);
        skip(EPOCH + GRACE);
        bond.triggerDefault();

        vm.prank(alice);
        bond.redeem();
        vm.prank(bob);
        bond.transfer(alice, 40_000e18);
        vm.prank(alice);
        bond.redeem();
        assertEq(bond.totalSupply(), 0);
        assertEq(bond.recoveryPaid(), bond.recoveryPool());
    }

    // R-5 (documented limitation) -----------------------------------------

    function test_R5_v3_contractHolderCannotClaim_butOthersUnaffected() public {
        (TapBond bond,) = activeBond(0);
        RejectsETH pool = new RejectsETH();
        vm.prank(alice);
        bond.transfer(address(pool), 60_000e18);

        vm.prank(issuer);
        bond.distribute{value: 10 ether}();

        vm.expectRevert(TapBond.TransferFailed.selector);
        bond.claimRevenueFor(address(pool));

        uint256 b0 = bob.balance;
        vm.prank(bob);
        bond.claimRevenue();
        assertEq(bob.balance - b0, 4 ether);
    }

    // R-6 ---------------------------------------------------------------

    function test_R6_v2_guaranteedBondRaisesZeroNetCapital() public {
        RevenueBondEscrow e = _v2Escrow(10 ether); // 1000 tokens, 10 ETH principal
        uint256 start = issuer.balance;
        vm.startPrank(issuer);
        e.depositPrincipal{value: 10 ether}();
        e.startSale(0.01 ether, issuer); // price = principal per token
        vm.stopPrank();

        vm.prank(alice);
        e.buyTokens{value: 10 ether}(1_000e18 - 0); // buys everything
        // Issuer locked 10 and received 10: net funding 0 (and owes revenue share)
        assertEq(issuer.balance, start, "V2: net capital raised = 0");
    }

    function test_R6_v3_issuerGetsRealFunding() public {
        (TapBond bond,) = activeBond(0);
        uint256 start = issuer.balance;
        vm.prank(issuer);
        bond.drawCapital(issuer);
        assertEq(issuer.balance - start, 24.5 ether, "25 ETH initial release minus 2% fee");
    }

    // R-7 ---------------------------------------------------------------

    function test_R7_v2_reputationFarmedForFree() public {
        vm.startPrank(issuer);
        (address s,) = v2SoftFactory.createSeries("Farm", "F", issuer, 2000, 30, 1_000e18, 0.001 ether);
        RevenueSeries series = RevenueSeries(payable(s));
        v2Registry.updateExpectedRevenue(s, 0.002 ether);
        uint256 before = issuer.balance;
        series.distributeRevenue{value: 0.001 ether}();
        series.distributeRevenue{value: 0.001 ether}();
        series.claimRevenue(); // issuer owns 100% of supply -> gets it all back
        vm.stopPrank();

        assertEq(v2Registry.getReputationScore(issuer), 100, "V2 BUG: perfect score");
        assertEq(before - issuer.balance, 0, "for zero cost (gas only)");
    }

    function test_R7_v3_issuerStartsWithZeroSupply() public {
        (TapBond bond,) = createBond(defaultTerms(), 0);
        assertEq(bond.balanceOf(issuer), 0);
        // Paying coupons requires an ACTIVE bond, which requires third-party capital >= minRaise.
        vm.prank(issuer);
        vm.expectRevert(TapBond.WrongState.selector);
        bond.distribute{value: 1 ether}();
    }

    // R-8 ---------------------------------------------------------------

    function test_R8_v3_priceImmutable() public {
        (TapBond bond,) = createBond(defaultTerms(), 0);
        assertEq(bond.price(), PRICE);
        // No setter exists; buyers always pay ceil(amount * price).
        uint256 before = alice.balance;
        vm.prank(alice);
        bond.buy{value: 50 ether}(1_000e18);
        assertEq(before - alice.balance, 1 ether);
    }

    // R-10 --------------------------------------------------------------

    function test_R10_v3_dustTransfersAllowed() public {
        (TapBond bond,) = activeBond(0);
        vm.prank(alice);
        bond.transfer(carol, 1); // 1 wei of token — V2 escrow reverted below 1e18
        assertEq(bond.balanceOf(carol), 1);
    }
}
