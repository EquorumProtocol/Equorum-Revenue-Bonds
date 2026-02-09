const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFullStack, createSeriesViaFactory, DEFAULT_PARAMS } = require("./helpers");

describe("Edge Cases, Stress Tests & Gas Benchmarks", function () {
  let owner, treasury, protocol, rest, registry, factory;
  let alice, bob;

  beforeEach(async function () {
    ({ owner, treasury, protocol, rest, registry, factory } = await deployFullStack());
    [alice, bob] = rest;
  });

  // ============================================
  // 1) BOUNDARY VALUES - EVERY EDGE
  // ============================================
  describe("Boundary Values - Exhaustive", function () {
    it("Should accept all minimum valid parameters simultaneously", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "Min", "MIN", protocol.address,
          1, 30, ethers.parseEther("1000"), ethers.parseEther("0.001")
        )
      ).to.not.be.reverted;
    });

    it("Should accept all maximum valid parameters simultaneously", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "Max", "MAX", protocol.address,
          5000, 1825, ethers.parseEther("1000000000"), ethers.parseEther("100")
        )
      ).to.not.be.reverted;
    });

    it("Should reject BPS = 0", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address, 0, 180,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.be.revertedWith("Invalid BPS");
    });

    it("Should accept BPS = 1 (minimum)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address, 1, 180,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.not.be.reverted;
    });

    it("Should accept BPS = 5000 (maximum)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address, 5000, 180,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.not.be.reverted;
    });

    it("Should reject BPS = 5001 (just above max)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address, 5001, 180,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.be.revertedWith("Invalid BPS");
    });

    it("Should reject BPS = 10000 (100%)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address, 10000, 180,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.be.revertedWith("Invalid BPS");
    });

    it("Should reject duration = 0", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address, 2500, 0,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.be.revertedWith("Invalid duration");
    });

    it("Should reject duration = 29 (just below min)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address, 2500, 29,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.be.revertedWith("Invalid duration");
    });

    it("Should accept duration = 30 (minimum)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address, 2500, 30,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.not.be.reverted;
    });

    it("Should accept duration = 1825 (maximum = 5 years)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address, 2500, 1825,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.not.be.reverted;
    });

    it("Should reject duration = 1826 (just above max)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address, 2500, 1826,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.be.revertedWith("Invalid duration");
    });

    it("Should reject supply = 0", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address, 2500, 180,
          0, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.be.revertedWith("Supply too low");
    });

    it("Should reject supply = 999 tokens (just below min)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address, 2500, 180,
          ethers.parseEther("999"), DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.be.revertedWith("Supply too low");
    });

    it("Should accept supply = 1000 tokens (minimum)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address, 2500, 180,
          ethers.parseEther("1000"), DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.not.be.reverted;
    });

    it("Should reject minDistribution = 0", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address, 2500, 180,
          DEFAULT_PARAMS.totalSupply, 0
        )
      ).to.be.revertedWith("Min distribution too low");
    });

    it("Should reject minDistribution = 0.0009 ether (just below min)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address, 2500, 180,
          DEFAULT_PARAMS.totalSupply, ethers.parseEther("0.0009")
        )
      ).to.be.revertedWith("Min distribution too low");
    });

    it("Should accept minDistribution = 0.001 ether (minimum)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address, 2500, 180,
          DEFAULT_PARAMS.totalSupply, ethers.parseEther("0.001")
        )
      ).to.not.be.reverted;
    });

    it("Should accept very large minDistribution (100 ETH)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address, 2500, 180,
          DEFAULT_PARAMS.totalSupply, ethers.parseEther("100")
        )
      ).to.not.be.reverted;
    });

    it("Should handle empty string name and symbol", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "", "", protocol.address, 2500, 180,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.not.be.reverted;
    });

    it("Should handle very long name (200 chars)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "A".repeat(200), "B".repeat(100), protocol.address, 2500, 180,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.not.be.reverted;
    });
  });

  // ============================================
  // 2) MANY HOLDERS - STRESS
  // ============================================
  describe("Many Holders - Stress", function () {
    it("Should handle 15 holders with correct proportional distribution", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      const signers = await ethers.getSigners();
      const holders = signers.slice(3, 18);
      const amountPerHolder = ethers.parseEther("10000");

      for (const holder of holders) {
        await series.connect(protocol).transfer(holder.address, amountPerHolder);
      }

      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("100") });

      // Each holder: 10K/1M = 1%, revenue = 100 ETH, so ~1 ETH each
      for (const holder of holders) {
        const claimable = await series.calculateClaimable(holder.address);
        expect(claimable).to.be.closeTo(ethers.parseEther("1"), ethers.parseEther("0.01"));
      }

      // All holders claim
      for (const holder of holders) {
        await series.connect(holder).claimRevenue();
        expect(await series.calculateClaimable(holder.address)).to.equal(0);
      }
    });

    it("Should handle holders with vastly different balances", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      const signers = await ethers.getSigners();

      // Whale: 900K, medium: 90K, small: 9K, tiny: 1K
      await series.connect(protocol).transfer(signers[3].address, ethers.parseEther("900000"));
      await series.connect(protocol).transfer(signers[4].address, ethers.parseEther("90000"));
      await series.connect(protocol).transfer(signers[5].address, ethers.parseEther("9000"));
      await series.connect(protocol).transfer(signers[6].address, ethers.parseEther("1000"));

      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("100") });

      // Whale: 90% of 100 = 90 ETH
      expect(await series.calculateClaimable(signers[3].address))
        .to.be.closeTo(ethers.parseEther("90"), ethers.parseEther("0.01"));
      // Medium: 9% = 9 ETH
      expect(await series.calculateClaimable(signers[4].address))
        .to.be.closeTo(ethers.parseEther("9"), ethers.parseEther("0.01"));
      // Small: 0.9% = 0.9 ETH
      expect(await series.calculateClaimable(signers[5].address))
        .to.be.closeTo(ethers.parseEther("0.9"), ethers.parseEther("0.01"));
      // Tiny: 0.1% = 0.1 ETH
      expect(await series.calculateClaimable(signers[6].address))
        .to.be.closeTo(ethers.parseEther("0.1"), ethers.parseEther("0.01"));
    });

    it("Should handle holder with 1 wei of tokens", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, 1n);
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      // 1 wei out of 1M tokens = negligible, but should not revert
      const claimable = await series.calculateClaimable(alice.address);
      expect(claimable).to.be.gte(0);
    });
  });

  // ============================================
  // 3) MULTIPLE SERIES - STRESS
  // ============================================
  describe("Multiple Series - Stress", function () {
    it("Should handle 5 independent series from same protocol", async function () {
      const seriesContracts = [];
      for (let i = 0; i < 5; i++) {
        const { series } = await createSeriesViaFactory(factory, protocol, {
          name: `Series ${i}`, symbol: `S${i}`,
        });
        seriesContracts.push(series);
      }

      expect(await factory.getTotalSeries()).to.equal(5);

      for (const s of seriesContracts) {
        await s.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
        await s.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      }

      for (const s of seriesContracts) {
        const claimable = await s.calculateClaimable(alice.address);
        expect(claimable).to.be.closeTo(ethers.parseEther("1"), ethers.parseEther("0.01"));
        await s.connect(alice).claimRevenue();
      }
    });

    it("Should handle series from multiple different protocols", async function () {
      const signers = await ethers.getSigners();
      const protocols = signers.slice(3, 8);

      for (let i = 0; i < protocols.length; i++) {
        await createSeriesViaFactory(factory, protocols[i], {
          name: `Protocol ${i} Series`, symbol: `P${i}S`,
        });
      }

      expect(await factory.getTotalSeries()).to.equal(5);

      for (const p of protocols) {
        const pSeries = await factory.getSeriesByProtocol(p.address);
        expect(pSeries.length).to.equal(1);
      }
    });

    it("Should handle series with different BPS values", async function () {
      const bpsValues = [1, 500, 1000, 2500, 5000];
      for (let i = 0; i < bpsValues.length; i++) {
        const { series } = await createSeriesViaFactory(factory, protocol, {
          name: `BPS ${bpsValues[i]}`, symbol: `B${i}`,
          revenueShareBPS: bpsValues[i],
        });
        expect(await series.revenueShareBPS()).to.equal(bpsValues[i]);
      }
    });
  });

  // ============================================
  // 4) REVENUE PRECISION & ROUNDING
  // ============================================
  describe("Revenue Precision & Rounding", function () {
    it("Should handle exact minimum distribution amount", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await expect(
        series.connect(protocol).distributeRevenue({ value: ethers.parseEther("0.001") })
      ).to.not.be.reverted;
    });

    it("Should handle large revenue (1000 ETH)", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1000") });
      const claimable = await series.calculateClaimable(alice.address);
      expect(claimable).to.equal(ethers.parseEther("500"));
    });

    it("Should handle odd decimal supply without loss", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol, {
        totalSupply: ethers.parseEther("1234567.89"),
      });
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      expect(await series.totalRevenueReceived()).to.equal(ethers.parseEther("10"));
    });

    it("Should accumulate revenue correctly over 20 distributions", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));

      for (let i = 0; i < 20; i++) {
        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") });
      }

      expect(await series.totalRevenueReceived()).to.equal(ethers.parseEther("20"));
      const claimable = await series.calculateClaimable(alice.address);
      expect(claimable).to.be.closeTo(ethers.parseEther("10"), ethers.parseEther("0.01"));
    });

    it("Should not lose dust across many small distributions", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));

      // 10 distributions of 0.01 ETH each
      for (let i = 0; i < 10; i++) {
        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("0.01") });
      }

      // Alice has 10% of tokens, total revenue = 0.1 ETH, alice gets 0.01 ETH
      const claimable = await series.calculateClaimable(alice.address);
      expect(claimable).to.be.closeTo(ethers.parseEther("0.01"), ethers.parseEther("0.001"));
    });

    it("Should handle 50/50 split exactly", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));
      // protocol keeps 500K, alice has 500K

      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      const aliceClaimable = await series.calculateClaimable(alice.address);
      const protocolClaimable = await series.calculateClaimable(protocol.address);

      expect(aliceClaimable).to.equal(ethers.parseEther("5"));
      expect(protocolClaimable).to.equal(ethers.parseEther("5"));
    });

    it("Should handle 1/3 split with acceptable rounding", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol, {
        totalSupply: ethers.parseEther("3000000"),
      });
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("1000000"));
      await series.connect(protocol).transfer(bob.address, ethers.parseEther("1000000"));
      // Each has 1/3

      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("9") });

      const aliceClaimable = await series.calculateClaimable(alice.address);
      const bobClaimable = await series.calculateClaimable(bob.address);
      const protocolClaimable = await series.calculateClaimable(protocol.address);

      expect(aliceClaimable).to.be.closeTo(ethers.parseEther("3"), ethers.parseEther("0.001"));
      expect(bobClaimable).to.be.closeTo(ethers.parseEther("3"), ethers.parseEther("0.001"));
      expect(protocolClaimable).to.be.closeTo(ethers.parseEther("3"), ethers.parseEther("0.001"));
    });

    it("Should not allow total claims to exceed total distributed", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      const signers = await ethers.getSigners();
      const holders = signers.slice(3, 8);
      const amountPerHolder = ethers.parseEther("100000");

      for (const h of holders) {
        await series.connect(protocol).transfer(h.address, amountPerHolder);
      }

      const distributionAmount = ethers.parseEther("10");
      await series.connect(protocol).distributeRevenue({ value: distributionAmount });

      let totalClaimed = 0n;
      for (const h of holders) {
        const claimable = await series.calculateClaimable(h.address);
        if (claimable > 0n) {
          const balBefore = await ethers.provider.getBalance(h.address);
          const tx = await series.connect(h).claimRevenue();
          const receipt = await tx.wait();
          const gas = receipt.gasUsed * receipt.gasPrice;
          const balAfter = await ethers.provider.getBalance(h.address);
          totalClaimed += (balAfter - balBefore + gas);
        }
      }

      // Protocol claims too
      const protocolClaimable = await series.calculateClaimable(protocol.address);
      if (protocolClaimable > 0n) {
        const balBefore = await ethers.provider.getBalance(protocol.address);
        const tx = await series.connect(protocol).claimRevenue();
        const receipt = await tx.wait();
        const gas = receipt.gasUsed * receipt.gasPrice;
        const balAfter = await ethers.provider.getBalance(protocol.address);
        totalClaimed += (balAfter - balBefore + gas);
      }

      // Total claimed should not exceed distributed (allowing small rounding)
      expect(totalClaimed).to.be.lte(distributionAmount + ethers.parseEther("0.001"));
    });
  });

  // ============================================
  // 5) ROUTER EDGE CASES
  // ============================================
  describe("Router Edge Cases", function () {
    it("Should handle receive from multiple sources", async function () {
      const { router } = await createSeriesViaFactory(factory, protocol);
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("5") });
      await bob.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("3") });
      expect(await router.totalRevenueReceived()).to.equal(ethers.parseEther("8"));
      expect(await router.pendingToRoute()).to.equal(ethers.parseEther("8"));
    });

    it("Should handle route when amount below series minDistribution", async function () {
      const { router } = await createSeriesViaFactory(factory, protocol, {
        minDistributionAmount: ethers.parseEther("1"),
      });
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("0.01") });
      await expect(router.routeRevenue()).to.emit(router, "RouteAttemptFailed");
    });

    it("Should handle receiveAndRoute in one call", async function () {
      const { series, router } = await createSeriesViaFactory(factory, protocol);
      await router.connect(alice).receiveAndRoute({ value: ethers.parseEther("10") });
      expect(await series.totalRevenueReceived()).to.be.gt(0);
      expect(await router.pendingToRoute()).to.equal(0);
    });

    it("Should handle multiple route cycles correctly", async function () {
      const { series, router } = await createSeriesViaFactory(factory, protocol);

      for (let i = 0; i < 5; i++) {
        await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
        await router.routeRevenue();
      }

      // 5 cycles * 10 ETH * 20% = 10 ETH to series
      expect(await series.totalRevenueReceived()).to.be.closeTo(
        ethers.parseEther("10"), ethers.parseEther("0.01")
      );
      expect(await router.totalRoutedToSeries()).to.be.closeTo(
        ethers.parseEther("10"), ethers.parseEther("0.01")
      );
    });

    it("Should handle BPS = 1 (0.01%) routing correctly", async function () {
      const { series, router } = await createSeriesViaFactory(factory, protocol, {
        revenueShareBPS: 1,
      });
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("100") });
      await router.routeRevenue();
      // 0.01% of 100 = 0.01 ETH (rounded up)
      expect(await series.totalRevenueReceived()).to.be.gte(ethers.parseEther("0.01"));
    });

    it("Should handle BPS = 5000 (50%) routing correctly", async function () {
      const { series, router } = await createSeriesViaFactory(factory, protocol, {
        revenueShareBPS: 5000,
      });
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("100") });
      await router.routeRevenue();
      // 50% of 100 = 50 ETH
      expect(await series.totalRevenueReceived()).to.be.closeTo(
        ethers.parseEther("50"), ethers.parseEther("0.01")
      );
    });
  });

  // ============================================
  // 6) MATURITY EDGE CASES
  // ============================================
  describe("Maturity Edge Cases", function () {
    it("Should handle shortest possible series (30 days)", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol, { durationDays: 30 });
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") });
      await time.increase(30 * 24 * 60 * 60);
      await expect(series.matureSeries()).to.not.be.reverted;
    });

    it("Should handle longest possible series (1825 days = 5 years)", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol, { durationDays: 1825 });
      expect(await series.active()).to.be.true;
      // Don't fast-forward 5 years, just verify it was created correctly
      const maturity = await series.maturityDate();
      const now = BigInt(await time.latest());
      expect(maturity - now).to.be.closeTo(BigInt(1825 * 24 * 60 * 60), 5n);
    });

    it("Should allow claims long after maturity", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Fast forward way past maturity (2x duration)
      await time.increase(DEFAULT_PARAMS.durationDays * 2 * 24 * 60 * 60);
      await series.matureSeries();

      // Claims still work
      await expect(series.connect(alice).claimRevenue()).to.not.be.reverted;
    });

    it("Should allow token transfers after maturity", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();
      await expect(
        series.connect(protocol).transfer(alice.address, ethers.parseEther("1000"))
      ).to.not.be.reverted;
    });

    it("Should handle transfer + claim after maturity correctly", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();

      // Alice transfers to bob AFTER maturity
      await series.connect(alice).transfer(bob.address, ethers.parseEther("500000"));

      // Alice's rewards should be snapshotted
      const aliceClaimable = await series.calculateClaimable(alice.address);
      expect(aliceClaimable).to.be.closeTo(ethers.parseEther("5"), ethers.parseEther("0.001"));

      // Bob should have 0 (got tokens after distribution)
      expect(await series.calculateClaimable(bob.address)).to.equal(0);
    });
  });

  // ============================================
  // 7) COMPLEX TRADING PATTERNS
  // ============================================
  describe("Complex Trading Patterns", function () {
    it("Should handle rapid buy-sell-buy pattern", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      const amount = ethers.parseEther("100000");

      // Protocol -> Alice
      await series.connect(protocol).transfer(alice.address, amount);
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Alice -> Bob (Alice's rewards should be snapshotted)
      await series.connect(alice).transfer(bob.address, amount);

      // New distribution
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Bob -> Alice (Bob's rewards should be snapshotted)
      await series.connect(bob).transfer(alice.address, amount);

      // Alice should have rewards from first distribution only
      const aliceClaimable = await series.calculateClaimable(alice.address);
      expect(aliceClaimable).to.be.closeTo(ethers.parseEther("1"), ethers.parseEther("0.01"));

      // Bob should have rewards from second distribution only
      const bobClaimable = await series.calculateClaimable(bob.address);
      expect(bobClaimable).to.be.closeTo(ethers.parseEther("1"), ethers.parseEther("0.01"));
    });

    it("Should handle approve + transferFrom pattern correctly", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Alice approves bob to spend
      await series.connect(alice).approve(bob.address, ethers.parseEther("50000"));
      await series.connect(bob).transferFrom(alice.address, bob.address, ethers.parseEther("50000"));

      // Alice's rewards from before transfer should be intact
      const aliceClaimable = await series.calculateClaimable(alice.address);
      expect(aliceClaimable).to.be.closeTo(ethers.parseEther("1"), ethers.parseEther("0.01"));
    });

    it("Should handle transfer to self", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Transfer to self should not affect rewards
      await series.connect(alice).transfer(alice.address, ethers.parseEther("50000"));
      const claimable = await series.calculateClaimable(alice.address);
      expect(claimable).to.be.closeTo(ethers.parseEther("1"), ethers.parseEther("0.01"));
    });
  });

  // ============================================
  // 8) GAS BENCHMARKS
  // ============================================
  describe("Gas Benchmarks", function () {
    it("Should have reasonable gas for series creation", async function () {
      const tx = await factory.connect(protocol).createSeries(
        DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
        DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
        DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
      );
      const receipt = await tx.wait();
      console.log("      createSeries gas:", receipt.gasUsed.toString());
      expect(receipt.gasUsed).to.be.lt(5000000);
    });

    it("Should have reasonable gas for distributeRevenue", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      const tx = await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") });
      const receipt = await tx.wait();
      console.log("      distributeRevenue gas:", receipt.gasUsed.toString());
      expect(receipt.gasUsed).to.be.lt(200000);
    });

    it("Should have reasonable gas for claimRevenue", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      const tx = await series.connect(alice).claimRevenue();
      const receipt = await tx.wait();
      console.log("      claimRevenue gas:", receipt.gasUsed.toString());
      expect(receipt.gasUsed).to.be.lt(150000);
    });

    it("Should have reasonable gas for routeRevenue", async function () {
      const { router } = await createSeriesViaFactory(factory, protocol);
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
      const tx = await router.routeRevenue();
      const receipt = await tx.wait();
      console.log("      routeRevenue gas:", receipt.gasUsed.toString());
      expect(receipt.gasUsed).to.be.lt(300000);
    });

    it("Should have reasonable gas for token transfer (with reward update)", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") });
      const tx = await series.connect(protocol).transfer(alice.address, ethers.parseEther("1000"));
      const receipt = await tx.wait();
      console.log("      transfer (with rewards) gas:", receipt.gasUsed.toString());
      expect(receipt.gasUsed).to.be.lt(150000);
    });

    it("Should have reasonable gas for claimFor", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      const tx = await series.connect(bob).claimFor(alice.address);
      const receipt = await tx.wait();
      console.log("      claimFor gas:", receipt.gasUsed.toString());
      expect(receipt.gasUsed).to.be.lt(150000);
    });

    it("Should have reasonable gas for receiveAndRoute", async function () {
      const { router } = await createSeriesViaFactory(factory, protocol);
      const tx = await router.connect(alice).receiveAndRoute({ value: ethers.parseEther("10") });
      const receipt = await tx.wait();
      console.log("      receiveAndRoute gas:", receipt.gasUsed.toString());
      expect(receipt.gasUsed).to.be.lt(300000);
    });

    it("Gas should not increase significantly after many distributions", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));

      // First distribution
      const tx1 = await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") });
      const receipt1 = await tx1.wait();
      const gas1 = receipt1.gasUsed;

      // 10 more distributions
      for (let i = 0; i < 10; i++) {
        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") });
      }

      // 12th distribution
      const tx2 = await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") });
      const receipt2 = await tx2.wait();
      const gas2 = receipt2.gasUsed;

      // Gas should not increase more than 20%
      expect(gas2).to.be.lt(gas1 * 120n / 100n);
    });
  });

  // ============================================
  // 9) SERIES INFO VIEW
  // ============================================
  describe("Series Info Consistency", function () {
    it("Should return consistent info before and after distributions", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);

      const infoBefore = await series.getSeriesInfo();
      expect(infoBefore.isActive).to.be.true;
      expect(infoBefore.totalRevenue).to.equal(0);

      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      const infoAfter = await series.getSeriesInfo();
      expect(infoAfter.isActive).to.be.true;
      expect(infoAfter.totalRevenue).to.equal(ethers.parseEther("10"));
      expect(infoAfter.timeRemaining).to.be.gt(0);
    });

    it("Should show inactive and zero timeRemaining after maturity", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      const info = await series.getSeriesInfo();
      expect(info.isActive).to.be.false;
      expect(info.timeRemaining).to.equal(0);
    });

    it("Should return correct effectiveMinDistribution", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      const effectiveMin = await series.getEffectiveMinDistribution();
      expect(effectiveMin).to.be.gt(0);
    });
  });
});
