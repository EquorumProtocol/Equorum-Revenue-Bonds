// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Base.t.sol";

contract TapBondTest is Base {
    // ------------------------------------------------------------------
    // Sale
    // ------------------------------------------------------------------

    function test_buy_mintsAndChargesCeilCost() public {
        (TapBond bond,) = createBond(defaultTerms(), 0);
        vm.prank(alice);
        bond.buy{value: 1 ether}(1_000e18);
        assertEq(bond.balanceOf(alice), 1_000e18);
        assertEq(bond.raised(), 1 ether);
        assertEq(address(bond).balance, 1 ether);
    }

    function test_buy_refundsExcess() public {
        (TapBond bond,) = createBond(defaultTerms(), 0);
        uint256 before = alice.balance;
        vm.prank(alice);
        bond.buy{value: 5 ether}(1_000e18);
        assertEq(before - alice.balance, 1 ether);
    }

    function test_buy_roundsCostUp_noFreeTokens() public {
        (TapBond bond,) = createBond(defaultTerms(), 0);
        // 1 wei of token at 0.001 ETH/token costs 1e-3 wei -> must round up to 1 wei
        vm.prank(alice);
        bond.buy{value: 1}(1);
        assertEq(bond.raised(), 1);
        vm.prank(alice);
        vm.expectRevert(TapBond.InsufficientPayment.selector);
        bond.buy{value: 0}(1);
    }

    function test_buy_revertsAboveMaxSupply() public {
        (TapBond bond,) = createBond(defaultTerms(), 0);
        vm.prank(alice);
        vm.expectRevert(TapBond.ExceedsMaxSupply.selector);
        bond.buy{value: 101 ether}(100_001e18);
    }

    function test_buy_revertsAfterSaleEnd() public {
        (TapBond bond,) = createBond(defaultTerms(), 0);
        skip(SALE);
        vm.prank(alice);
        vm.expectRevert(TapBond.SaleClosed.selector);
        bond.buy{value: 1 ether}(1_000e18);
    }

    function test_issuerHoldsNoTokensAtCreation() public {
        (TapBond bond,) = createBond(defaultTerms(), 0);
        assertEq(bond.totalSupply(), 0);
        assertEq(bond.balanceOf(issuer), 0);
    }

    function test_finalize_earlyOnlyByIssuerAboveMin() public {
        (TapBond bond,) = createBond(defaultTerms(), 0);
        buy(bond, alice, 60_000e18); // 60 ETH >= 50 min

        vm.prank(alice);
        vm.expectRevert(TapBond.SaleClosed.selector);
        bond.finalize();

        vm.prank(issuer);
        bond.finalize();
        assertEq(uint256(bond.state()), uint256(TapBond.State.Active));
        assertEq(bond.couponAmount(), 6 ether); // 10% of 60
    }

    function test_finalize_earlyBelowMinReverts() public {
        (TapBond bond,) = createBond(defaultTerms(), 0);
        buy(bond, alice, 10_000e18);
        vm.prank(issuer);
        vm.expectRevert(TapBond.MinRaiseNotMet.selector);
        bond.finalize();
    }

    function test_finalize_afterDeadlineBelowMin_fails_andRefundsAtCost() public {
        (TapBond bond,) = createBond(defaultTerms(), 5 ether);
        buy(bond, alice, 10_000e18); // 10 ETH
        buy(bond, bob, 5_000e18); // 5 ETH
        skip(SALE);
        bond.finalize();
        assertEq(uint256(bond.state()), uint256(TapBond.State.Failed));

        uint256 a0 = alice.balance;
        vm.prank(alice);
        bond.redeem();
        assertEq(alice.balance - a0, 10 ether);

        uint256 b0 = bob.balance;
        vm.prank(bob);
        bond.redeem();
        assertEq(bob.balance - b0, 5 ether);

        uint256 i0 = issuer.balance;
        vm.prank(issuer);
        bond.withdrawCollateral(issuer);
        assertEq(issuer.balance - i0, 5 ether);
        assertEq(address(bond).balance, 0);

        (,,, uint8 outcome) = _record(bond);
        assertEq(outcome, 3);
    }

    function test_cancelSale_onlyIssuer() public {
        (TapBond bond,) = createBond(defaultTerms(), 0);
        buy(bond, alice, 1_000e18);
        vm.prank(alice);
        vm.expectRevert(TapBond.NotIssuer.selector);
        bond.cancelSale();
        vm.prank(issuer);
        bond.cancelSale();
        assertEq(uint256(bond.state()), uint256(TapBond.State.Failed));
    }

    function test_distribute_revertsDuringSale() public {
        (TapBond bond,) = createBond(defaultTerms(), 0);
        buy(bond, alice, 1_000e18);
        vm.prank(issuer);
        vm.expectRevert(TapBond.WrongState.selector);
        bond.distribute{value: 1 ether}();
    }

    // ------------------------------------------------------------------
    // Tap schedule — spec §3.4 worked example
    // ------------------------------------------------------------------

    function test_tap_workedExample() public {
        (TapBond bond,) = activeBond(0);
        assertEq(bond.raised(), 100 ether);
        assertEq(bond.couponAmount(), 10 ether);

        // Epoch 0: 25 drawable
        assertEq(bond.availableToDraw(), 25 ether);
        _draw(bond);
        assertEq(bond.capitalDrawn(), 25 ether);

        // Epoch 1 elapsed, coupon 1 paid -> +25
        skip(EPOCH);
        assertEq(bond.availableToDraw(), 0, "stalled until coupon paid");
        payCoupons(bond, 1);
        assertEq(bond.availableToDraw(), 25 ether);
        _draw(bond);

        // Epoch 2
        skip(EPOCH);
        payCoupons(bond, 1);
        _draw(bond);
        assertEq(bond.capitalDrawn(), 75 ether);

        // Epoch 3 -> fully drawn
        skip(EPOCH);
        payCoupons(bond, 1);
        _draw(bond);
        assertEq(bond.capitalDrawn(), 100 ether);
        assertEq(bond.totalPaid(), 30 ether); // exposure = 100 - 30 = 70 (peak)
    }

    function test_tap_prepaymentDoesNotAccelerateBeyondCalendar() public {
        (TapBond bond,) = activeBond(0);
        payCoupons(bond, 12); // prepay everything
        assertEq(bond.epochsCovered(), 12);
        assertEq(bond.availableToDraw(), 25 ether, "only initial release at epoch 0");
        skip(EPOCH);
        assertEq(bond.availableToDraw(), 50 ether);
    }

    function test_tap_initialReleaseZero() public {
        TapBond.Terms memory t = defaultTerms();
        t.initialReleaseBps = 0;
        (TapBond bond,) = createBond(t, 0);
        buy(bond, alice, 100_000e18);
        bond.finalize();
        assertEq(bond.availableToDraw(), 0);
        vm.prank(issuer);
        vm.expectRevert(TapBond.ZeroAmount.selector);
        bond.drawCapital(issuer);
    }

    function test_draw_feeGoesToSplitter_80_20() public {
        (TapBond bond,) = activeBond(0);
        uint256 i0 = issuer.balance;
        vm.prank(issuer);
        uint256 net = bond.drawCapital(issuer);
        assertEq(net, 24.5 ether); // 25 - 2%
        assertEq(issuer.balance - i0, 24.5 ether);
        assertEq(address(splitter).balance, 0.5 ether);
        assertEq(splitter.treasuryOwed(), 0.4 ether);
        assertEq(splitter.builderOwed(), 0.1 ether);
    }

    function test_draw_onlyIssuer() public {
        (TapBond bond,) = activeBond(0);
        vm.prank(alice);
        vm.expectRevert(TapBond.NotIssuer.selector);
        bond.drawCapital(alice);
    }

    // ------------------------------------------------------------------
    // Default
    // ------------------------------------------------------------------

    function test_default_notBeforeGrace() public {
        (TapBond bond,) = activeBond(0);
        skip(EPOCH + GRACE - 1);
        vm.expectRevert(TapBond.NotInDefault.selector);
        bond.triggerDefault();
        skip(1);
        bond.triggerDefault();
        assertEq(uint256(bond.state()), uint256(TapBond.State.Defaulted));
    }

    function test_default_recoveryIsUndrawnPlusCollateral() public {
        (TapBond bond,) = activeBond(25 ether);
        _draw(bond); // 25 drawn
        skip(EPOCH);
        payCoupons(bond, 1); // 10 paid
        _draw(bond); // 50 drawn

        skip(EPOCH + GRACE); // epoch 2 coupon missed
        bond.triggerDefault();
        assertEq(bond.recoveryPool(), 50 ether + 25 ether);

        // alice 60%, bob 40%
        uint256 a0 = alice.balance;
        vm.prank(alice);
        bond.redeem();
        assertEq(alice.balance - a0, 45 ether);

        uint256 b0 = bob.balance;
        vm.prank(bob);
        bond.redeem();
        assertEq(bob.balance - b0, 30 ether);

        // Coupons already paid remain claimable after redeem.
        assertEq(bond.earned(alice), 6 ether);
        vm.prank(alice);
        bond.claimRevenue();
        assertEq(bond.earned(bob), 4 ether);

        // Total recovered by holders = 10 coupons + 50 undrawn + 25 collateral
        (,,, uint8 outcome) = _record(bond);
        assertEq(outcome, 2);
        EquorumRegistry.IssuerStats memory s = registry.getIssuerStats(issuer);
        assertEq(s.bondsDefaulted, 1);
        assertEq(s.totalRaised, 100 ether);
        assertEq(s.totalPaid, 10 ether);
    }

    function test_default_closesTap() public {
        (TapBond bond,) = activeBond(0);
        skip(EPOCH + GRACE);
        bond.triggerDefault();
        vm.prank(issuer);
        vm.expectRevert(TapBond.WrongState.selector);
        bond.drawCapital(issuer);
    }

    function test_default_lateCouponWithinGraceAvoidsDefault() public {
        (TapBond bond,) = activeBond(0);
        skip(EPOCH + GRACE - 1);
        payCoupons(bond, 1);
        skip(1);
        assertFalse(bond.isDefaultable());
    }

    // ------------------------------------------------------------------
    // Maturity
    // ------------------------------------------------------------------

    function test_mature_fullLifecycle() public {
        (TapBond bond,) = activeBond(10 ether);
        for (uint256 i = 0; i < 12; i++) {
            skip(EPOCH);
            payCoupons(bond, 1);
            if (bond.availableToDraw() > 0) _draw(bond);
        }
        bond.mature();
        assertEq(uint256(bond.state()), uint256(TapBond.State.Matured));
        assertEq(bond.capitalDrawn(), 100 ether);

        uint256 i0 = issuer.balance;
        vm.prank(issuer);
        bond.withdrawCollateral(issuer);
        assertEq(issuer.balance - i0, 10 ether);

        // Holders earned 120 ETH of coupons (1.2x)
        assertEq(bond.earned(alice), 72 ether);
        assertEq(bond.earned(bob), 48 ether);

        EquorumRegistry.IssuerStats memory s = registry.getIssuerStats(issuer);
        assertEq(s.bondsMatured, 1);
        assertEq(s.totalPaid, 120 ether);
    }

    function test_mature_requiresAllCoupons() public {
        (TapBond bond,) = activeBond(0);
        payCoupons(bond, 11);
        skip(12 * EPOCH);
        vm.expectRevert(TapBond.CouponsOutstanding.selector);
        bond.mature();
        payCoupons(bond, 1);
        bond.mature();
    }

    function test_mature_notBeforeTerm() public {
        (TapBond bond,) = activeBond(0);
        payCoupons(bond, 12);
        vm.expectRevert(TapBond.NotMatured.selector);
        bond.mature();
    }

    function test_collateral_lockedWhileActive() public {
        (TapBond bond,) = activeBond(10 ether);
        vm.prank(issuer);
        vm.expectRevert(TapBond.WrongState.selector);
        bond.withdrawCollateral(issuer);
    }

    // ------------------------------------------------------------------
    // Revenue accounting
    // ------------------------------------------------------------------

    function test_revenue_followsTransfers() public {
        (TapBond bond,) = activeBond(0);
        vm.prank(issuer);
        bond.distribute{value: 10 ether}(); // alice 6, bob 4

        vm.prank(alice);
        bond.transfer(carol, 60_000e18); // alice -> carol

        vm.prank(issuer);
        bond.distribute{value: 10 ether}(); // carol 6, bob 4

        assertEq(bond.earned(alice), 6 ether);
        assertEq(bond.earned(carol), 6 ether);
        assertEq(bond.earned(bob), 8 ether);
    }

    function test_revenue_claimForSendsToAccount() public {
        (TapBond bond,) = activeBond(0);
        vm.prank(issuer);
        bond.distribute{value: 10 ether}();
        uint256 a0 = alice.balance;
        vm.prank(carol);
        bond.claimRevenueFor(alice);
        assertEq(alice.balance - a0, 6 ether);
    }

    function test_revenue_remainderCarryLosesNothing() public {
        (TapBond bond,) = createBond(defaultTerms(), 0);
        buy(bond, alice, 33_333e18);
        buy(bond, bob, 33_333e18);
        buy(bond, carol, 33_334e18);
        vm.prank(issuer);
        bond.finalize();
        uint256 total;
        for (uint256 i = 0; i < 50; i++) {
            uint256 amt = 1 ether + 7 + i; // amounts that don't divide the supply evenly
            total += amt;
            vm.prank(issuer);
            bond.distribute{value: amt}();
        }
        uint256 sum = bond.earned(alice) + bond.earned(bob) + bond.earned(carol);
        assertLe(sum, total);
        // Remainders are carried forward, not dropped. Outstanding at any moment:
        // per-holder floor (<1 wei each) + unassigned carry (< supply / 1e18 wei).
        uint256 maxCarryWei = bond.totalSupply() / 1e18;
        assertGe(sum + 3 + maxCarryWei, total);
        // ...and the carry is assigned by later distributions, not lost:
        vm.prank(issuer);
        bond.distribute{value: 1 ether}();
        uint256 sum2 = bond.earned(alice) + bond.earned(bob) + bond.earned(carol);
        assertGe(sum2 + 3 + maxCarryWei, total + 1 ether);
    }

    function test_revenue_extraAfterMaturityDoesNotCountAsCoupon() public {
        (TapBond bond,) = activeBond(0);
        payCoupons(bond, 12);
        skip(12 * EPOCH);
        bond.mature();
        uint256 paidBefore = bond.totalPaid();
        vm.prank(issuer);
        bond.distribute{value: 1 ether}();
        assertEq(bond.totalPaid(), paidBefore);
        assertEq(bond.totalDistributed(), paidBefore + 1 ether);
    }

    function test_transferToBondItselfReverts() public {
        (TapBond bond,) = activeBond(0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSignature("ERC20InvalidReceiver(address)", address(bond)));
        bond.transfer(address(bond), 1e18);
    }

    function test_directETHRejected() public {
        (TapBond bond,) = activeBond(0);
        vm.prank(alice);
        (bool ok,) = address(bond).call{value: 1 ether}("");
        assertFalse(ok);
    }

    // ------------------------------------------------------------------
    // Terms validation
    // ------------------------------------------------------------------

    function test_terms_couponMustCoverPrincipal() public {
        TapBond.Terms memory t = defaultTerms();
        t.couponBps = 800; // 12 * 8% = 96% < 100%
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(TapBond.InvalidTerms.selector, "couponBps*numEpochs"));
        factory.createBond("x", "x", t);
    }

    function test_terms_graceAboveEpochReverts() public {
        TapBond.Terms memory t = defaultTerms();
        t.gracePeriod = uint64(EPOCH + 1);
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(TapBond.InvalidTerms.selector, "gracePeriod"));
        factory.createBond("x", "x", t);
    }

    function test_terms_tapEpochsAboveTermReverts() public {
        TapBond.Terms memory t = defaultTerms();
        t.tapEpochs = 13;
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(TapBond.InvalidTerms.selector, "tapEpochs"));
        factory.createBond("x", "x", t);
    }

    function test_terms_minRaiseAboveMaxRaiseReverts() public {
        TapBond.Terms memory t = defaultTerms();
        t.minRaise = 100 ether + 1;
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(TapBond.InvalidTerms.selector, "minRaise"));
        factory.createBond("x", "x", t);
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    function _draw(TapBond bond) internal {
        vm.prank(issuer);
        bond.drawCapital(issuer);
    }

    function _record(TapBond bond) internal view returns (address, uint256, uint256, uint8) {
        (address iss,, uint256 r, uint256 p, uint8 outcome) = registry.bonds(address(bond));
        return (iss, r, p, outcome);
    }
}
