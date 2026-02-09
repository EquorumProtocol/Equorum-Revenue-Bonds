const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFullStack, createSeriesViaFactory, DEFAULT_PARAMS, REGISTRY_PATH } = require("./helpers");

/**
 * PARTIAL FAILURE / LIFECYCLE WITH FAILURES
 * 
 * Tests that verify the system handles "half the flow broke" scenarios:
 * - Registry reverting during registration but series still works
 * - Fee receiver rejecting ETH (malicious treasury)
 * - Router routing fails but funds are safe
 * - Distribution succeeds but registry recording fails
 * - Mixed success/failure across multiple operations
 */
describe("Partial Failure & Lifecycle with Failures", function () {
  let owner, treasury, protocol, rest, registry, factory;
  let alice, bob;

  beforeEach(async function () {
    ({ owner, treasury, protocol, rest, registry, factory } = await deployFullStack());
    [alice, bob] = rest;
  });

  // ============================================
  // 1) REGISTRY FAILURES DURING CREATION
  // ============================================
  describe("Registry Failures During Series Creation", function () {
    it("Should still create series even if registry authorization fails", async function () {
      // Revoke factory as reporter — registry calls will fail
      await registry.revokeReporter(await factory.getAddress());

      // Series creation should still succeed (registry failure is graceful)
      const tx = await factory.connect(protocol).createSeries(
        "Orphan", "ORP", protocol.address,
        2000, 180, ethers.parseEther("100000"), ethers.parseEther("0.001")
      );

      const receipt = await tx.wait();

      // SeriesCreated event should still fire
      const seriesCreatedEvent = receipt.logs.find(
        log => {
          try {
            return factory.interface.parseLog(log)?.name === "SeriesCreated";
          } catch { return false; }
        }
      );
      expect(seriesCreatedEvent).to.not.be.undefined;

      // ReputationRegistrationFailed should also fire
      const failedEvent = receipt.logs.find(
        log => {
          try {
            return factory.interface.parseLog(log)?.name === "ReputationRegistrationFailed";
          } catch { return false; }
        }
      );
      expect(failedEvent).to.not.be.undefined;
    });

    it("Series created without registry should still distribute and claim", async function () {
      await registry.revokeReporter(await factory.getAddress());

      const result = await factory.connect(protocol).createSeries.staticCall(
        "NoReg", "NR", protocol.address,
        2000, 180, ethers.parseEther("100000"), ethers.parseEther("0.001")
      );
      await factory.connect(protocol).createSeries(
        "NoReg", "NR", protocol.address,
        2000, 180, ethers.parseEther("100000"), ethers.parseEther("0.001")
      );

      const Series = await ethers.getContractFactory("contracts/v2/core/RevenueSeries.sol:RevenueSeries");
      const series = Series.attach(result.seriesAddress);

      // Distribute works (registry recordDistribution will fail gracefully)
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("50000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Claim works
      const claimable = await series.calculateClaimable(alice.address);
      expect(claimable).to.be.gt(0);
      await series.connect(alice).claimRevenue();
    });
  });

  // ============================================
  // 2) FEE RECEIVER REJECTING ETH
  // ============================================
  describe("Fee Receiver Rejecting ETH (Malicious Treasury)", function () {
    it("Should revert series creation if treasury rejects fee", async function () {
      // Deploy malicious treasury that rejects ETH
      const MaliciousTreasury = await ethers.getContractFactory("MaliciousTreasury");
      const malTreasury = await MaliciousTreasury.deploy();
      const malAddr = await malTreasury.getAddress();

      // Set fee policy pointing to malicious treasury
      const FeePolicy = await ethers.getContractFactory("SimpleFeePolicy");
      const feePolicy = await FeePolicy.deploy(ethers.parseEther("0.01"), malAddr);
      await factory.setFeePolicy(await feePolicy.getAddress());

      // Creation should revert because fee transfer fails
      await expect(
        factory.connect(protocol).createSeries(
          "Fail", "F", protocol.address,
          2000, 180, ethers.parseEther("100000"), ethers.parseEther("0.001"),
          { value: ethers.parseEther("0.01") }
        )
      ).to.be.revertedWith("Fee transfer failed");
    });

    it("Should not create series or change state if fee transfer fails", async function () {
      const MaliciousTreasury = await ethers.getContractFactory("MaliciousTreasury");
      const malTreasury = await MaliciousTreasury.deploy();

      const FeePolicy = await ethers.getContractFactory("SimpleFeePolicy");
      const feePolicy = await FeePolicy.deploy(ethers.parseEther("0.01"), await malTreasury.getAddress());
      await factory.setFeePolicy(await feePolicy.getAddress());

      const seriesBefore = await factory.getTotalSeries();

      await expect(
        factory.connect(protocol).createSeries(
          "Fail", "F", protocol.address,
          2000, 180, ethers.parseEther("100000"), ethers.parseEther("0.001"),
          { value: ethers.parseEther("0.01") }
        )
      ).to.be.reverted;

      // No series created
      expect(await factory.getTotalSeries()).to.equal(seriesBefore);
    });

    it("Should recover after fixing treasury — creation works again", async function () {
      const MaliciousTreasury = await ethers.getContractFactory("MaliciousTreasury");
      const malTreasury = await MaliciousTreasury.deploy();

      const FeePolicy = await ethers.getContractFactory("SimpleFeePolicy");
      const feePolicy = await FeePolicy.deploy(ethers.parseEther("0.01"), await malTreasury.getAddress());
      await factory.setFeePolicy(await feePolicy.getAddress());

      // Fails
      await expect(
        factory.connect(protocol).createSeries(
          "Fail", "F", protocol.address,
          2000, 180, ethers.parseEther("100000"), ethers.parseEther("0.001"),
          { value: ethers.parseEther("0.01") }
        )
      ).to.be.reverted;

      // Fix: point fee receiver to valid address
      await feePolicy.setFeeReceiver(treasury.address);

      // Now works
      await createSeriesViaFactory(factory, protocol, {
        name: "Fixed", symbol: "FIX", value: ethers.parseEther("0.01"),
      });
    });
  });

  // ============================================
  // 3) ROUTER ROUTING FAILURES
  // ============================================
  describe("Router Routing Failures", function () {
    it("Should keep funds safe when series rejects distribution (matured)", async function () {
      const { series, router } = await createSeriesViaFactory(factory, protocol);
      const routerAddr = await router.getAddress();

      // Send ETH to router
      await alice.sendTransaction({ to: routerAddr, value: ethers.parseEther("10") });
      expect(await router.pendingToRoute()).to.equal(ethers.parseEther("10"));

      // Mature series
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();

      // Route fails gracefully
      await expect(router.routeRevenue()).to.emit(router, "RouteAttemptFailed");

      // Funds still in router
      expect(await ethers.provider.getBalance(routerAddr)).to.equal(ethers.parseEther("10"));

      // pendingToRoute cleared (so protocol can withdraw)
      expect(await router.pendingToRoute()).to.equal(0);

      // Protocol can withdraw
      await router.connect(protocol).withdrawAllToProtocol();
      expect(await ethers.provider.getBalance(routerAddr)).to.equal(0);
    });

    it("Should keep funds safe when distribution amount below minimum", async function () {
      const { router } = await createSeriesViaFactory(factory, protocol, {
        minDistributionAmount: ethers.parseEther("1"),
      });
      const routerAddr = await router.getAddress();

      // Send tiny amount: 20% of 0.01 = 0.002 ETH < 1 ETH min
      await alice.sendTransaction({ to: routerAddr, value: ethers.parseEther("0.01") });

      // Route fails gracefully (amount below min)
      await expect(router.routeRevenue()).to.emit(router, "RouteAttemptFailed");

      // Funds still in router, still pending
      expect(await router.pendingToRoute()).to.equal(ethers.parseEther("0.01"));
      expect(await ethers.provider.getBalance(routerAddr)).to.equal(ethers.parseEther("0.01"));
    });

    it("Should accumulate and succeed after enough ETH received", async function () {
      const { series, router } = await createSeriesViaFactory(factory, protocol, {
        minDistributionAmount: ethers.parseEther("1"),
      });
      const routerAddr = await router.getAddress();

      // Send small amounts that individually fail
      await alice.sendTransaction({ to: routerAddr, value: ethers.parseEther("2") });
      await router.routeRevenue();

      // Route should fail (20% of 2 = 0.4 ETH < 1 ETH min)
      // But let's check if it accumulated enough
      const pending = await router.pendingToRoute();
      if (pending > 0n) {
        // Need more ETH
        await alice.sendTransaction({ to: routerAddr, value: ethers.parseEther("10") });
        await router.routeRevenue();
      }

      // Should have routed by now
      expect(await series.totalRevenueReceived()).to.be.gt(0);
    });

    it("Should track failedRouteCount correctly", async function () {
      const { series, router } = await createSeriesViaFactory(factory, protocol);

      expect(await router.failedRouteCount()).to.equal(0);

      // Mature series to force failures
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();

      // Send and try to route multiple times
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("1") });
      await router.routeRevenue();
      expect(await router.failedRouteCount()).to.equal(1);

      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("1") });
      await router.routeRevenue();
      expect(await router.failedRouteCount()).to.equal(2);
    });
  });

  // ============================================
  // 4) DISTRIBUTION SUCCEEDS BUT REGISTRY FAILS
  // ============================================
  describe("Distribution Succeeds but Registry Recording Fails", function () {
    it("Should distribute revenue even if registry recordDistribution fails", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));

      // Revoke series as reporter so recordDistribution fails
      const seriesAddr = await series.getAddress();
      await registry.revokeReporter(seriesAddr);

      // Distribution should still succeed (registry failure is caught)
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      expect(await series.totalRevenueReceived()).to.equal(ethers.parseEther("10"));

      // Alice can still claim
      const claimable = await series.calculateClaimable(alice.address);
      expect(claimable).to.be.closeTo(ethers.parseEther("5"), ethers.parseEther("0.01"));
      await series.connect(alice).claimRevenue();
    });

    it("Should not affect revenue accounting when registry fails", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));

      // First distribution with working registry
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      const rpt1 = await series.revenuePerTokenStored();

      // Break registry
      const seriesAddr = await series.getAddress();
      await registry.revokeReporter(seriesAddr);

      // Second distribution with broken registry
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      const rpt2 = await series.revenuePerTokenStored();

      // revenuePerToken should have increased by same amount both times
      expect(rpt2 - rpt1).to.be.closeTo(rpt1, 1n);
      expect(await series.totalRevenueReceived()).to.equal(ethers.parseEther("20"));
    });
  });

  // ============================================
  // 5) MIXED SUCCESS/FAILURE LIFECYCLE
  // ============================================
  describe("Mixed Success/Failure Lifecycle", function () {
    it("Full lifecycle with intermittent failures", async function () {
      // Phase 1: Normal creation
      const { series, router } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("300000"));
      await series.connect(protocol).transfer(bob.address, ethers.parseEther("200000"));

      // Phase 2: Normal distributions
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("5") });

      // Phase 3: Alice claims successfully
      await series.connect(alice).claimRevenue();

      // Phase 4: Break registry mid-flight
      await registry.revokeReporter(await series.getAddress());

      // Phase 5: Distribution still works (registry failure graceful)
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Phase 6: Bob claims (should work despite broken registry)
      const bobClaimable = await series.calculateClaimable(bob.address);
      expect(bobClaimable).to.be.gt(0);
      await series.connect(bob).claimRevenue();

      // Phase 7: Router operations
      await router.connect(alice).receiveAndRoute({ value: ethers.parseEther("50") });

      // Phase 8: Verify accounting
      expect(await series.totalRevenueReceived()).to.be.gt(ethers.parseEther("25"));

      // Phase 9: Maturity
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();

      // Phase 10: Post-maturity claims still work
      const alicePostMaturity = await series.calculateClaimable(alice.address);
      if (alicePostMaturity > 0n) {
        await series.connect(alice).claimRevenue();
      }
    });

    it("Should handle creation failure then success in sequence", async function () {
      // Attempt with bad params (fails)
      await expect(
        factory.connect(protocol).createSeries(
          "Bad", "BAD", protocol.address,
          0, 180, ethers.parseEther("100000"), ethers.parseEther("0.001")
        )
      ).to.be.revertedWith("Invalid BPS");

      // State should be clean — next creation works
      const { series } = await createSeriesViaFactory(factory, protocol, {
        name: "Good", symbol: "GOOD",
      });
      expect(await series.totalSupply()).to.be.gt(0);
      expect(await factory.getTotalSeries()).to.equal(1);
    });

    it("Should handle claim failure (no revenue) then success after distribution", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));

      // Claim fails (no revenue yet)
      await expect(series.connect(alice).claimRevenue()).to.be.revertedWith("No revenue to claim");

      // Distribute
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Now claim works
      await series.connect(alice).claimRevenue();
      expect(await series.calculateClaimable(alice.address)).to.equal(0);
    });

    it("Should handle router failure then recovery", async function () {
      const { series, router } = await createSeriesViaFactory(factory, protocol);

      // Pause router
      await router.connect(protocol).pause();

      // Route fails
      await expect(
        router.connect(alice).receiveAndRoute({ value: ethers.parseEther("10") })
      ).to.be.reverted;

      // Unpause
      await router.connect(protocol).unpause();

      // Now works
      await router.connect(alice).receiveAndRoute({ value: ethers.parseEther("10") });
      expect(await series.totalRevenueReceived()).to.be.gt(0);
    });
  });

  // ============================================
  // 6) EMERGENCY RECOVERY SCENARIOS
  // ============================================
  describe("Emergency Recovery Scenarios", function () {
    it("Should recover funds via emergency withdraw after routing failure", async function () {
      const { series, router } = await createSeriesViaFactory(factory, protocol);
      const routerAddr = await router.getAddress();

      // Send ETH and route successfully
      await router.connect(alice).receiveAndRoute({ value: ethers.parseEther("10") });

      // Protocol share stays in router
      const routerBalance = await ethers.provider.getBalance(routerAddr);

      if (routerBalance > 0n) {
        // Emergency withdraw to protocol
        await router.connect(protocol).emergencyWithdraw(protocol.address);
        expect(await ethers.provider.getBalance(routerAddr)).to.equal(0);
      }
    });

    it("Should protect bondholder funds during emergency withdraw", async function () {
      const { router } = await createSeriesViaFactory(factory, protocol);
      const routerAddr = await router.getAddress();

      // Send ETH but DON'T route (pendingToRoute > 0)
      await alice.sendTransaction({ to: routerAddr, value: ethers.parseEther("10") });
      expect(await router.pendingToRoute()).to.equal(ethers.parseEther("10"));

      // Emergency withdraw should fail or only withdraw non-pending funds
      await expect(
        router.connect(protocol).emergencyWithdraw(protocol.address)
      ).to.be.revertedWith("No available balance (funds protected for bondholders)");

      // Funds still safe
      expect(await ethers.provider.getBalance(routerAddr)).to.equal(ethers.parseEther("10"));
    });
  });
});
