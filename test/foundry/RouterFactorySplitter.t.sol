// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Base.t.sol";

contract RouterTest is Base {
    function test_router_splitsWhileActive() public {
        (TapBond bond, TapRouter router) = activeBond(0);
        (bool ok,) = address(router).call{value: 10 ether}("");
        assertTrue(ok);
        router.route();
        assertEq(bond.totalPaid(), 2 ether); // 20%
        assertEq(router.issuerOwed(), 8 ether);
        assertEq(bond.earned(alice), 1.2 ether);

        uint256 i0 = issuer.balance;
        router.withdrawIssuer(); // anyone can trigger, goes to issuer
        assertEq(issuer.balance - i0, 8 ether);
    }

    function test_router_waitsDuringSale() public {
        (, TapRouter router) = createBond(defaultTerms(), 0);
        (bool ok,) = address(router).call{value: 1 ether}("");
        assertTrue(ok);
        vm.expectRevert(TapRouter.WaitingForSale.selector);
        router.route();
    }

    function test_router_allToIssuerAfterFailedSale() public {
        (TapBond bond, TapRouter router) = createBond(defaultTerms(), 0);
        vm.prank(issuer);
        bond.cancelSale();
        (bool ok,) = address(router).call{value: 1 ether}("");
        assertTrue(ok);
        router.route();
        assertEq(router.issuerOwed(), 1 ether);
    }

    function test_router_allToIssuerAfterTerm() public {
        (TapBond bond, TapRouter router) = activeBond(0);
        vm.warp(bond.maturityTime());
        (bool ok,) = address(router).call{value: 1 ether}("");
        assertTrue(ok);
        router.route();
        assertEq(router.issuerOwed(), 1 ether);
        assertEq(bond.totalPaid(), 0);
    }

    function test_router_keepsPayingHoldersAfterDefault() public {
        (TapBond bond, TapRouter router) = activeBond(0);
        skip(EPOCH + GRACE);
        bond.triggerDefault();
        (bool ok,) = address(router).call{value: 10 ether}("");
        assertTrue(ok);
        router.route();
        assertEq(bond.totalDistributed(), 2 ether);
        assertEq(bond.earned(bob), 0.8 ether);
    }

    function test_router_revenueCountsTowardCoupons() public {
        (TapBond bond, TapRouter router) = activeBond(0);
        // 50 ETH of protocol revenue -> 10 ETH to holders = 1 epoch covered
        (bool ok,) = address(router).call{value: 50 ether}("");
        assertTrue(ok);
        router.route();
        assertEq(bond.epochsCovered(), 1);
    }

    function test_router_issuerPullToAlternateAddress() public {
        (, TapRouter router) = activeBond(0);
        (bool ok,) = address(router).call{value: 10 ether}("");
        assertTrue(ok);
        router.route();
        vm.prank(alice);
        vm.expectRevert(TapRouter.NotIssuer.selector);
        router.withdrawIssuerTo(alice);
        vm.prank(issuer);
        router.withdrawIssuerTo(carol);
        assertEq(carol.balance, 1_000 ether + 8 ether);
    }
}

contract FactoryTest is Base {
    function test_factory_feeCapped() public {
        vm.prank(multisig);
        vm.expectRevert(TapBondFactory.FeeTooHigh.selector);
        factory.setDrawFee(301);
    }

    function test_factory_onlyOwnerAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        factory.setDrawFee(0);
        vm.prank(alice);
        vm.expectRevert();
        factory.setPaused(true);
    }

    function test_factory_pauseBlocksNewBondsOnly() public {
        (TapBond bond,) = createBond(defaultTerms(), 0);
        vm.prank(multisig);
        factory.setPaused(true);
        vm.prank(issuer);
        vm.expectRevert(TapBondFactory.Paused.selector);
        factory.createBond("x", "x", defaultTerms());
        // existing bond keeps working
        buy(bond, alice, 1_000e18);
    }

    function test_factory_feeSnapshotPerBond() public {
        (TapBond bond,) = activeBond(0);
        vm.prank(multisig);
        factory.setDrawFee(0);
        assertEq(bond.drawFeeBps(), DRAW_FEE_BPS);
    }

    function test_factory_noRouterWhenShareZero() public {
        TapBond.Terms memory t = defaultTerms();
        t.revenueShareBps = 0;
        (TapBond bond, TapRouter router) = createBond(t, 0);
        assertEq(address(router), address(0));
        assertTrue(factory.isBond(address(bond)));
    }

    function test_factory_unapprovedFactoryCannotRegister_revertsLoudly() public {
        TapBondFactory rogue = new TapBondFactory(multisig, address(splitter), registry, 0);
        vm.prank(issuer);
        vm.expectRevert(EquorumRegistry.NotFactory.selector);
        rogue.createBond("x", "x", defaultTerms());
    }

    function test_factory_collateralLocked() public {
        (TapBond bond,) = createBond(defaultTerms(), 7 ether);
        assertEq(bond.collateral(), 7 ether);
        assertEq(address(bond).balance, 7 ether);
    }
}

contract SplitterTest is Base {
    function test_splitter_80_20() public {
        (bool ok,) = address(splitter).call{value: 10 ether}("");
        assertTrue(ok);
        assertEq(splitter.treasuryOwed(), 8 ether);
        assertEq(splitter.builderOwed(), 2 ether);
        splitter.withdrawTreasury();
        splitter.withdrawBuilder();
        assertEq(multisig.balance, 8 ether);
        assertEq(builder.balance, 2 ether);
    }

    function test_splitter_eachPartyRotatesOnlyItsOwnAddress() public {
        address newBuilder = makeAddr("newBuilder");
        vm.prank(multisig);
        vm.expectRevert(FeeSplitter.NotBuilder.selector);
        splitter.setBuilder(multisig);

        vm.prank(builder);
        vm.expectRevert(FeeSplitter.NotTreasury.selector);
        splitter.setTreasury(builder);

        vm.prank(builder);
        splitter.setBuilder(newBuilder);
        assertEq(splitter.builder(), newBuilder);
        assertEq(splitter.BUILDER_SHARE_BPS(), 2000);
    }

    function test_splitter_revertingTreasuryDoesNotBlockFees() public {
        RejectsETH bad = new RejectsETH();
        FeeSplitter s = new FeeSplitter(address(bad), builder);
        (bool ok,) = address(s).call{value: 1 ether}("");
        assertTrue(ok, "receive never reverts");
        vm.expectRevert(FeeSplitter.TransferFailed.selector);
        s.withdrawTreasury();
        s.withdrawBuilder(); // builder still paid
        assertEq(builder.balance, 0.2 ether);
    }

    function testFuzz_splitter_neverLosesWei(uint96 a, uint96 b) public {
        vm.deal(address(this), uint256(a) + b);
        (bool ok1,) = address(splitter).call{value: a}("");
        (bool ok2,) = address(splitter).call{value: b}("");
        assertTrue(ok1 && ok2);
        assertEq(splitter.treasuryOwed() + splitter.builderOwed(), uint256(a) + b);
    }
}

contract RegistryTest is Base {
    function test_registry_onlyRegisteredBondsWrite() public {
        vm.expectRevert(EquorumRegistry.NotRegisteredBond.selector);
        registry.recordPayment(1 ether);
        vm.expectRevert(EquorumRegistry.NotRegisteredBond.selector);
        registry.recordDefault();
    }

    function test_registry_ownerCannotEditRecords() public {
        // The only admin function is setFactory; there is no blacklist/whitelist/edit.
        vm.prank(multisig);
        registry.setFactory(address(0xBEEF), true);
        vm.prank(address(0xBEEF));
        registry.registerBond(issuer, address(0xB0));
        vm.prank(address(0xBEEF));
        vm.expectRevert(EquorumRegistry.AlreadyRegistered.selector);
        registry.registerBond(alice, address(0xB0));
    }

    function test_registry_closedBondCannotReopenOutcome() public {
        (TapBond bond,) = activeBond(0);
        skip(EPOCH + GRACE);
        bond.triggerDefault();
        vm.prank(address(bond));
        vm.expectRevert(EquorumRegistry.AlreadyClosed.selector);
        registry.recordMatured();
    }
}
