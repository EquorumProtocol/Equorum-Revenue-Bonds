const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFullStack, createSeriesViaFactory, DEFAULT_PARAMS } = require("./helpers");

/**
 * INVARIANT TESTS
 * 
 * These tests verify properties that must ALWAYS hold true regardless of
 * the sequence of actions. After every action we check:
 * 
 * INV-1: series.balance >= sum(calculateClaimable(holder)) for all holders
 * INV-2: sum(claimed) + sum(claimable) == totalRevenueReceived (within rounding)
 * INV-3: revenuePerTokenStored only increases (never decreases)
 * INV-4: After maturity: active == false, no new distributions, claims still work
 * INV-5: Router: pendingToRoute <= router.balance always
 * INV-6: Router: totalRoutedToSeries + totalReturnedToProtocol + balance == totalRevenueReceived
 * INV-7: No holder can claim more than their proportional share
 */
describe("Invariant Tests", function () {
  let owner, treasury, protocol, rest, registry, factory;
  let alice, bob, charlie, dave;

  beforeEach(async function () {
    ({ owner, treasury, protocol, rest, registry, factory } = await deployFullStack());
    [alice, bob, charlie, dave] = rest;
  });

  // ============================================
  // HELPER: Check all series invariants
  // ============================================
  async function checkSeriesInvariants(series, holders, totalClaimedSoFar) {
    const seriesAddr = await series.getAddress();
    const seriesBalance = await ethers.provider.getBalance(seriesAddr);
    const totalRevenue = await series.totalRevenueReceived();
    const revenuePerToken = await series.revenuePerTokenStored();

    // INV-1: contract balance >= sum of all claimable
    let sumClaimable = 0n;
    for (const h of holders) {
      const claimable = await series.calculateClaimable(h.address);
      sumClaimable += claimable;
    }
    expect(seriesBalance).to.be.gte(sumClaimable,
      "INV-1 VIOLATED: series balance < sum(claimable)");

    // INV-2: totalClaimed + sumClaimable <= totalRevenue (within rounding tolerance)
    const totalAccountedFor = totalClaimedSoFar + sumClaimable;
    const tolerance = BigInt(holders.length) * 2n; // 2 wei per holder rounding tolerance
    expect(totalAccountedFor).to.be.lte(totalRevenue + tolerance,
      "INV-2 VIOLATED: claimed + claimable > totalRevenue");

    // INV-3 is checked inline (revenuePerToken only increases)
    return { sumClaimable, revenuePerToken };
  }

  async function checkRouterInvariants(router) {
    const routerAddr = await router.getAddress();
    const routerBalance = await ethers.provider.getBalance(routerAddr);
    const pending = await router.pendingToRoute();
    const totalReceived = await router.totalRevenueReceived();
    const totalToSeries = await router.totalRoutedToSeries();
    const totalToProtocol = await router.totalReturnedToProtocol();

    // INV-5: pendingToRoute <= balance
    expect(pending).to.be.lte(routerBalance,
      "INV-5 VIOLATED: pendingToRoute > router balance");

    // INV-6: totalToSeries + totalToProtocol + balance == totalReceived
    const accounted = totalToSeries + totalToProtocol + routerBalance;
    expect(accounted).to.equal(totalReceived,
      "INV-6 VIOLATED: accounting mismatch in router");
  }

  // ============================================
  // 1) SERIES ACCOUNTING INVARIANTS
  // ============================================
  describe("Series Accounting Invariants", function () {
    it("INV-1: series.balance >= sum(claimable) after distributions and partial claims", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      const holders = [alice, bob, charlie];

      // Distribute tokens
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("300000"));
      await series.connect(protocol).transfer(bob.address, ethers.parseEther("200000"));
      await series.connect(protocol).transfer(charlie.address, ethers.parseEther("100000"));

      let totalClaimed = 0n;

      // Distribution 1
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      await checkSeriesInvariants(series, [...holders, protocol], totalClaimed);

      // Alice claims
      const aliceClaimable = await series.calculateClaimable(alice.address);
      await series.connect(alice).claimRevenue();
      totalClaimed += aliceClaimable;
      await checkSeriesInvariants(series, [...holders, protocol], totalClaimed);

      // Distribution 2
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("5") });
      await checkSeriesInvariants(series, [...holders, protocol], totalClaimed);

      // Bob claims
      const bobClaimable = await series.calculateClaimable(bob.address);
      await series.connect(bob).claimRevenue();
      totalClaimed += bobClaimable;
      await checkSeriesInvariants(series, [...holders, protocol], totalClaimed);

      // Distribution 3
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("20") });
      await checkSeriesInvariants(series, [...holders, protocol], totalClaimed);
    });

    it("INV-2: totalClaimed + sumClaimable == totalRevenue after all claims", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      const holders = [alice, bob];

      await series.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));
      await series.connect(protocol).transfer(bob.address, ethers.parseEther("500000"));

      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("20") });

      let totalClaimed = 0n;

      // Both claim
      for (const h of holders) {
        const claimable = await series.calculateClaimable(h.address);
        await series.connect(h).claimRevenue();
        totalClaimed += claimable;
      }

      // Protocol claims
      const protocolClaimable = await series.calculateClaimable(protocol.address);
      if (protocolClaimable > 0n) {
        await series.connect(protocol).claimRevenue();
        totalClaimed += protocolClaimable;
      }

      // After all claims, sum should equal totalRevenue (within rounding)
      const totalRevenue = await series.totalRevenueReceived();
      const diff = totalRevenue > totalClaimed ? totalRevenue - totalClaimed : totalClaimed - totalRevenue;
      expect(diff).to.be.lte(10n, "INV-2: total claimed diverges from total revenue");
    });

    it("INV-3: revenuePerTokenStored never decreases", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));

      let prevRevenuePerToken = 0n;

      for (let i = 0; i < 10; i++) {
        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") });
        const current = await series.revenuePerTokenStored();
        expect(current).to.be.gte(prevRevenuePerToken,
          `INV-3 VIOLATED at distribution ${i}: revenuePerToken decreased`);
        prevRevenuePerToken = current;

        // Transfer tokens around (should not affect revenuePerTokenStored)
        if (i % 2 === 0) {
          await series.connect(alice).transfer(bob.address, ethers.parseEther("10000"));
        } else {
          await series.connect(bob).transfer(alice.address, ethers.parseEther("10000"));
        }

        const afterTransfer = await series.revenuePerTokenStored();
        expect(afterTransfer).to.be.gte(prevRevenuePerToken,
          `INV-3 VIOLATED after transfer at step ${i}`);
      }
    });

    it("INV-7: No holder claims more than proportional share", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      const totalSupply = await series.totalSupply();

      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000")); // 10%
      await series.connect(protocol).transfer(bob.address, ethers.parseEther("200000"));   // 20%

      const revenue = ethers.parseEther("100");
      await series.connect(protocol).distributeRevenue({ value: revenue });

      // Alice: 10% of 100 = 10 ETH max
      const aliceClaimable = await series.calculateClaimable(alice.address);
      const aliceBalance = await series.balanceOf(alice.address);
      const aliceMaxShare = (revenue * aliceBalance) / totalSupply;
      expect(aliceClaimable).to.be.lte(aliceMaxShare + 1n,
        "INV-7: Alice claims more than proportional share");

      // Bob: 20% of 100 = 20 ETH max
      const bobClaimable = await series.calculateClaimable(bob.address);
      const bobBalance = await series.balanceOf(bob.address);
      const bobMaxShare = (revenue * bobBalance) / totalSupply;
      expect(bobClaimable).to.be.lte(bobMaxShare + 1n,
        "INV-7: Bob claims more than proportional share");
    });
  });

  // ============================================
  // 2) ROUTER ACCOUNTING INVARIANTS
  // ============================================
  describe("Router Accounting Invariants", function () {
    it("INV-5: pendingToRoute <= router.balance always", async function () {
      const { router } = await createSeriesViaFactory(factory, protocol);

      // Receive ETH
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
      await checkRouterInvariants(router);

      // Route
      await router.routeRevenue();
      await checkRouterInvariants(router);

      // Receive more
      await bob.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("5") });
      await checkRouterInvariants(router);

      // Route again
      await router.routeRevenue();
      await checkRouterInvariants(router);
    });

    it("INV-6: totalToSeries + totalToProtocol + balance == totalReceived", async function () {
      const { router } = await createSeriesViaFactory(factory, protocol);

      // Multiple cycles
      for (let i = 0; i < 5; i++) {
        await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
        await router.routeRevenue();
        await checkRouterInvariants(router);
      }

      // Withdraw protocol share
      const routerBalance = await ethers.provider.getBalance(await router.getAddress());
      if (routerBalance > 0n) {
        await router.connect(protocol).withdrawAllToProtocol();
        await checkRouterInvariants(router);
      }
    });

    it("INV-5+6: invariants hold after failed route attempts", async function () {
      const { series, router } = await createSeriesViaFactory(factory, protocol);

      // Send ETH
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
      await checkRouterInvariants(router);

      // Mature series to force route failure
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();

      // Route fails gracefully
      await router.routeRevenue();
      await checkRouterInvariants(router);

      // Protocol withdraws after failed route
      const balance = await ethers.provider.getBalance(await router.getAddress());
      if (balance > 0n) {
        await router.connect(protocol).withdrawAllToProtocol();
        await checkRouterInvariants(router);
      }
    });
  });

  // ============================================
  // 3) MATURITY INVARIANTS (INV-4)
  // ============================================
  describe("Maturity State Freeze Invariants", function () {
    it("INV-4: After maturity, active == false", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      expect(await series.active()).to.be.true;

      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();

      expect(await series.active()).to.be.false;
    });

    it("INV-4: After maturity, distributeRevenue reverts", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();

      await expect(
        series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") })
      ).to.be.revertedWith("Series not active");
    });

    it("INV-4: After maturity, matureSeries cannot be called again", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();

      await expect(series.matureSeries()).to.be.revertedWith("Already matured");
    });

    it("INV-4: After maturity, claims still work for pre-maturity revenue", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      const claimableBefore = await series.calculateClaimable(alice.address);
      expect(claimableBefore).to.be.gt(0);

      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();

      // Claimable should be preserved
      const claimableAfter = await series.calculateClaimable(alice.address);
      expect(claimableAfter).to.equal(claimableBefore);

      // Claim works
      await expect(series.connect(alice).claimRevenue()).to.not.be.reverted;
      expect(await series.calculateClaimable(alice.address)).to.equal(0);
    });

    it("INV-4: After maturity, transfers still work but don't create new rewards", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();

      // Transfer works
      await series.connect(alice).transfer(bob.address, ethers.parseEther("250000"));

      // Bob has no claimable (got tokens after last distribution)
      expect(await series.calculateClaimable(bob.address)).to.equal(0);

      // Alice still has her pre-transfer claimable
      expect(await series.calculateClaimable(alice.address)).to.be.gt(0);
    });

    it("INV-4: After maturity, totalRevenueReceived is frozen", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();

      const revenueFrozen = await series.totalRevenueReceived();

      // Try to distribute (should fail)
      await expect(
        series.connect(protocol).distributeRevenue({ value: ethers.parseEther("5") })
      ).to.be.reverted;

      // Revenue unchanged
      expect(await series.totalRevenueReceived()).to.equal(revenueFrozen);
    });

    it("INV-4: After maturity, revenuePerTokenStored is frozen", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();

      const rptFrozen = await series.revenuePerTokenStored();

      // Transfers should not change revenuePerTokenStored
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      expect(await series.revenuePerTokenStored()).to.equal(rptFrozen);
    });
  });

  // ============================================
  // 4) MINI-FUZZ: Random Action Sequences
  // ============================================
  describe("Mini-Fuzz: Random Action Sequences", function () {
    it("Should maintain all invariants across 50 random actions", async function () {
      const { series, router } = await createSeriesViaFactory(factory, protocol);
      const holders = [alice, bob, charlie, dave];
      const allAccounts = [protocol, ...holders];

      // Initial token distribution
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("200000"));
      await series.connect(protocol).transfer(bob.address, ethers.parseEther("150000"));
      await series.connect(protocol).transfer(charlie.address, ethers.parseEther("100000"));
      await series.connect(protocol).transfer(dave.address, ethers.parseEther("50000"));
      // protocol keeps 500K

      let totalClaimed = 0n;
      let prevRevenuePerToken = 0n;
      let actionLog = [];

      // Deterministic pseudo-random using block-based seed
      function pseudoRandom(seed, max) {
        // Simple LCG
        const next = (seed * 1103515245 + 12345) & 0x7fffffff;
        return { value: next % max, seed: next };
      }

      let seed = 42;

      for (let i = 0; i < 50; i++) {
        const { value: actionType, seed: s1 } = pseudoRandom(seed, 5);
        seed = s1;
        const { value: holderIdx, seed: s2 } = pseudoRandom(seed, holders.length);
        seed = s2;

        const holder = holders[holderIdx];

        try {
          switch (actionType) {
            case 0: {
              // DISTRIBUTE REVENUE
              const { value: amountIdx, seed: s3 } = pseudoRandom(seed, 5);
              seed = s3;
              const amounts = ["0.01", "0.1", "1", "5", "10"];
              const amount = ethers.parseEther(amounts[amountIdx]);
              await series.connect(protocol).distributeRevenue({ value: amount });
              actionLog.push(`[${i}] distribute ${amounts[amountIdx]} ETH`);
              break;
            }
            case 1: {
              // CLAIM REVENUE
              const claimable = await series.calculateClaimable(holder.address);
              if (claimable > 0n) {
                await series.connect(holder).claimRevenue();
                totalClaimed += claimable;
                actionLog.push(`[${i}] ${holder.address.slice(0, 8)} claimed ${ethers.formatEther(claimable)} ETH`);
              }
              break;
            }
            case 2: {
              // TRANSFER TOKENS
              const { value: recipientIdx, seed: s3 } = pseudoRandom(seed, holders.length);
              seed = s3;
              const recipient = holders[recipientIdx];
              const balance = await series.balanceOf(holder.address);
              if (balance > 0n && holder.address !== recipient.address) {
                const transferAmount = balance / 10n; // Transfer 10%
                if (transferAmount > 0n) {
                  await series.connect(holder).transfer(recipient.address, transferAmount);
                  actionLog.push(`[${i}] transfer ${ethers.formatEther(transferAmount)} tokens ${holder.address.slice(0, 8)} -> ${recipient.address.slice(0, 8)}`);
                }
              }
              break;
            }
            case 3: {
              // CLAIM FOR (relayer pattern)
              const claimable = await series.calculateClaimable(holder.address);
              if (claimable > 0n) {
                const { value: relayerIdx, seed: s3 } = pseudoRandom(seed, holders.length);
                seed = s3;
                const relayer = holders[relayerIdx];
                await series.connect(relayer).claimFor(holder.address);
                totalClaimed += claimable;
                actionLog.push(`[${i}] claimFor ${holder.address.slice(0, 8)} by ${relayer.address.slice(0, 8)}`);
              }
              break;
            }
            case 4: {
              // SEND TO ROUTER + ROUTE
              const { value: amountIdx, seed: s3 } = pseudoRandom(seed, 3);
              seed = s3;
              const amounts = ["1", "5", "10"];
              await router.connect(holder).receiveAndRoute({ value: ethers.parseEther(amounts[amountIdx]) });
              actionLog.push(`[${i}] receiveAndRoute ${amounts[amountIdx]} ETH`);
              break;
            }
          }
        } catch (e) {
          // Some actions may legitimately fail (e.g., no claimable, insufficient balance)
          actionLog.push(`[${i}] action ${actionType} failed: ${e.message.slice(0, 60)}`);
          continue;
        }

        // CHECK INVARIANTS AFTER EVERY ACTION
        const currentRPT = await series.revenuePerTokenStored();
        expect(currentRPT).to.be.gte(prevRevenuePerToken,
          `INV-3 VIOLATED at step ${i}: revenuePerToken decreased from ${prevRevenuePerToken} to ${currentRPT}`);
        prevRevenuePerToken = currentRPT;

        await checkSeriesInvariants(series, allAccounts, totalClaimed);
        await checkRouterInvariants(router);
      }

      // Final summary
      console.log(`      Mini-fuzz completed 50 actions, ${actionLog.length} logged`);
      console.log(`      Total claimed: ${ethers.formatEther(totalClaimed)} ETH`);
    });

    it("Should maintain invariants with aggressive transfer-then-claim pattern (30 rounds)", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      const holders = [alice, bob, charlie];

      await series.connect(protocol).transfer(alice.address, ethers.parseEther("300000"));
      await series.connect(protocol).transfer(bob.address, ethers.parseEther("300000"));
      await series.connect(protocol).transfer(charlie.address, ethers.parseEther("300000"));

      let totalClaimed = 0n;
      let prevRPT = 0n;

      for (let round = 0; round < 30; round++) {
        // Distribute
        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") });

        const rpt = await series.revenuePerTokenStored();
        expect(rpt).to.be.gte(prevRPT);
        prevRPT = rpt;

        // Rotate: each holder transfers 10% to next
        const fromIdx = round % 3;
        const toIdx = (round + 1) % 3;
        const from = holders[fromIdx];
        const to = holders[toIdx];
        const bal = await series.balanceOf(from.address);
        if (bal > ethers.parseEther("10000")) {
          await series.connect(from).transfer(to.address, ethers.parseEther("10000"));
        }

        // One holder claims
        const claimer = holders[round % 3];
        const claimable = await series.calculateClaimable(claimer.address);
        if (claimable > 0n) {
          await series.connect(claimer).claimRevenue();
          totalClaimed += claimable;
        }

        await checkSeriesInvariants(series, [...holders, protocol], totalClaimed);
      }
    });

    it("Should maintain invariants with interleaved router + series operations (30 rounds)", async function () {
      const { series, router } = await createSeriesViaFactory(factory, protocol);

      await series.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));

      let totalClaimed = 0n;

      for (let round = 0; round < 30; round++) {
        // Alternate: direct distribute vs router
        if (round % 2 === 0) {
          await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") });
        } else {
          await router.connect(alice).receiveAndRoute({ value: ethers.parseEther("5") });
        }

        // Claim every 3rd round
        if (round % 3 === 0) {
          const claimable = await series.calculateClaimable(alice.address);
          if (claimable > 0n) {
            await series.connect(alice).claimRevenue();
            totalClaimed += claimable;
          }
        }

        await checkSeriesInvariants(series, [alice, protocol], totalClaimed);
        await checkRouterInvariants(router);
      }
    });
  });
});
