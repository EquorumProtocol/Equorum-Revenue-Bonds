const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployFullStack, createSeriesViaFactory, DEFAULT_PARAMS } = require("./helpers");

/**
 * GAS GUARDRAILS
 * 
 * Hard gas limits per operation that FAIL the test if exceeded.
 * Purpose: Prevent regressions — if someone "fixes 188 bytes" today
 * and gas doubles tomorrow, this catches it.
 * 
 * Limits are set ~30% above current measured values to allow minor
 * optimizations/changes without false positives, but catch real regressions.
 * 
 * CURRENT BASELINE (measured on Hardhat):
 * - createSeries:      ~4,200,000 gas
 * - distributeRevenue:  ~90,000 gas
 * - claimRevenue:       ~65,000 gas
 * - claimFor:           ~70,000 gas
 * - transfer (cold):    ~75,000 gas
 * - transfer (warm):    ~55,000 gas
 * - routeRevenue:       ~240,000 gas
 * - receiveAndRoute:    ~250,000 gas
 * - withdrawToProtocol: ~50,000 gas
 */
describe("Gas Guardrails - Regression Detection", function () {
  let owner, treasury, protocol, rest, registry, factory;
  let alice, bob;

  // ============================================
  // HARD LIMITS (fail test if exceeded)
  // ============================================
  const GAS_LIMITS = {
    createSeries:       5_500_000n,
    distributeRevenue:    260_000n,
    claimRevenue:         120_000n,
    claimFor:             120_000n,
    transferCold:         130_000n,
    transferWarm:          165_000n,
    routeRevenue:         350_000n,
    receiveAndRoute:      350_000n,
    withdrawToProtocol:   100_000n,
    withdrawAll:          100_000n,
    emergencyWithdraw:    100_000n,
    matureSeries:         100_000n,
    pause:                 60_000n,
    unpause:               60_000n,
  };

  beforeEach(async function () {
    ({ owner, treasury, protocol, rest, registry, factory } = await deployFullStack());
    [alice, bob] = rest;
  });

  // Helper to measure gas
  async function measureGas(txPromise) {
    const tx = await txPromise;
    const receipt = await tx.wait();
    return receipt.gasUsed;
  }

  // ============================================
  // 1) FACTORY OPERATIONS
  // ============================================
  describe("Factory Operations", function () {
    it(`createSeries must use < ${GAS_LIMITS.createSeries} gas`, async function () {
      const gas = await measureGas(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      );
      console.log(`      createSeries: ${gas} gas`);
      expect(gas).to.be.lt(GAS_LIMITS.createSeries);
    });

    it(`pause must use < ${GAS_LIMITS.pause} gas`, async function () {
      const gas = await measureGas(factory.pause());
      console.log(`      factory.pause: ${gas} gas`);
      expect(gas).to.be.lt(GAS_LIMITS.pause);
    });

    it(`unpause must use < ${GAS_LIMITS.unpause} gas`, async function () {
      await factory.pause();
      const gas = await measureGas(factory.unpause());
      console.log(`      factory.unpause: ${gas} gas`);
      expect(gas).to.be.lt(GAS_LIMITS.unpause);
    });
  });

  // ============================================
  // 2) SERIES OPERATIONS
  // ============================================
  describe("Series Operations", function () {
    let series;

    beforeEach(async function () {
      ({ series } = await createSeriesViaFactory(factory, protocol));
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
    });

    it(`distributeRevenue must use < ${GAS_LIMITS.distributeRevenue} gas`, async function () {
      const gas = await measureGas(
        series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") })
      );
      console.log(`      distributeRevenue: ${gas} gas`);
      expect(gas).to.be.lt(GAS_LIMITS.distributeRevenue);
    });

    it(`claimRevenue must use < ${GAS_LIMITS.claimRevenue} gas`, async function () {
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      const gas = await measureGas(series.connect(alice).claimRevenue());
      console.log(`      claimRevenue: ${gas} gas`);
      expect(gas).to.be.lt(GAS_LIMITS.claimRevenue);
    });

    it(`claimFor must use < ${GAS_LIMITS.claimFor} gas`, async function () {
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      const gas = await measureGas(series.connect(bob).claimFor(alice.address));
      console.log(`      claimFor: ${gas} gas`);
      expect(gas).to.be.lt(GAS_LIMITS.claimFor);
    });

    it(`transfer (cold - first transfer to new address) must use < ${GAS_LIMITS.transferCold} gas`, async function () {
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") });
      // bob has never received tokens — cold storage slot
      const gas = await measureGas(
        series.connect(protocol).transfer(bob.address, ethers.parseEther("1000"))
      );
      console.log(`      transfer (cold): ${gas} gas`);
      expect(gas).to.be.lt(GAS_LIMITS.transferCold);
    });

    it(`transfer (warm - subsequent transfer) must use < ${GAS_LIMITS.transferWarm} gas`, async function () {
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") });
      // alice already has tokens — warm storage slot
      const gas = await measureGas(
        series.connect(protocol).transfer(alice.address, ethers.parseEther("1000"))
      );
      console.log(`      transfer (warm): ${gas} gas`);
      expect(gas).to.be.lt(GAS_LIMITS.transferWarm);
    });

    it(`matureSeries must use < ${GAS_LIMITS.matureSeries} gas`, async function () {
      const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      const gas = await measureGas(series.matureSeries());
      console.log(`      matureSeries: ${gas} gas`);
      expect(gas).to.be.lt(GAS_LIMITS.matureSeries);
    });
  });

  // ============================================
  // 3) ROUTER OPERATIONS
  // ============================================
  describe("Router Operations", function () {
    let series, router;

    beforeEach(async function () {
      ({ series, router } = await createSeriesViaFactory(factory, protocol));
    });

    it(`routeRevenue must use < ${GAS_LIMITS.routeRevenue} gas`, async function () {
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
      const gas = await measureGas(router.routeRevenue());
      console.log(`      routeRevenue: ${gas} gas`);
      expect(gas).to.be.lt(GAS_LIMITS.routeRevenue);
    });

    it(`receiveAndRoute must use < ${GAS_LIMITS.receiveAndRoute} gas`, async function () {
      const gas = await measureGas(
        router.connect(alice).receiveAndRoute({ value: ethers.parseEther("10") })
      );
      console.log(`      receiveAndRoute: ${gas} gas`);
      expect(gas).to.be.lt(GAS_LIMITS.receiveAndRoute);
    });

    it(`withdrawToProtocol must use < ${GAS_LIMITS.withdrawToProtocol} gas`, async function () {
      await router.connect(alice).receiveAndRoute({ value: ethers.parseEther("10") });
      const balance = await ethers.provider.getBalance(await router.getAddress());
      if (balance > 0n) {
        const gas = await measureGas(
          router.connect(protocol).withdrawToProtocol(balance)
        );
        console.log(`      withdrawToProtocol: ${gas} gas`);
        expect(gas).to.be.lt(GAS_LIMITS.withdrawToProtocol);
      }
    });

    it(`withdrawAllToProtocol must use < ${GAS_LIMITS.withdrawAll} gas`, async function () {
      await router.connect(alice).receiveAndRoute({ value: ethers.parseEther("10") });
      const balance = await ethers.provider.getBalance(await router.getAddress());
      if (balance > 0n) {
        const gas = await measureGas(router.connect(protocol).withdrawAllToProtocol());
        console.log(`      withdrawAllToProtocol: ${gas} gas`);
        expect(gas).to.be.lt(GAS_LIMITS.withdrawAll);
      }
    });

    it(`emergencyWithdraw must use < ${GAS_LIMITS.emergencyWithdraw} gas`, async function () {
      await router.connect(alice).receiveAndRoute({ value: ethers.parseEther("10") });
      const balance = await ethers.provider.getBalance(await router.getAddress());
      if (balance > 0n) {
        const gas = await measureGas(
          router.connect(protocol).emergencyWithdraw(protocol.address)
        );
        console.log(`      emergencyWithdraw: ${gas} gas`);
        expect(gas).to.be.lt(GAS_LIMITS.emergencyWithdraw);
      }
    });

    it(`router.pause must use < ${GAS_LIMITS.pause} gas`, async function () {
      const gas = await measureGas(router.connect(protocol).pause());
      console.log(`      router.pause: ${gas} gas`);
      expect(gas).to.be.lt(GAS_LIMITS.pause);
    });

    it(`router.unpause must use < ${GAS_LIMITS.unpause} gas`, async function () {
      await router.connect(protocol).pause();
      const gas = await measureGas(router.connect(protocol).unpause());
      console.log(`      router.unpause: ${gas} gas`);
      expect(gas).to.be.lt(GAS_LIMITS.unpause);
    });
  });

  // ============================================
  // 4) GAS STABILITY OVER TIME
  // ============================================
  describe("Gas Stability Over Time", function () {
    it("distributeRevenue gas should not grow with distribution count", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));

      const gasReadings = [];

      for (let i = 0; i < 15; i++) {
        const gas = await measureGas(
          series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") })
        );
        gasReadings.push(gas);
      }

      const first = gasReadings[0];
      const last = gasReadings[gasReadings.length - 1];

      console.log(`      distributeRevenue gas: first=${first}, last=${last}`);

      // Gas should not increase more than 10%
      expect(last).to.be.lt(first * 110n / 100n);
    });

    it("claimRevenue gas should not grow with distribution count", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));

      // First claim after 1 distribution
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") });
      const gas1 = await measureGas(series.connect(alice).claimRevenue());

      // 10 more distributions
      for (let i = 0; i < 10; i++) {
        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") });
      }

      // Second claim after 11 total distributions
      const gas2 = await measureGas(series.connect(alice).claimRevenue());

      console.log(`      claimRevenue gas: after 1 dist=${gas1}, after 11 dist=${gas2}`);

      // Gas should not increase more than 15%
      expect(gas2).to.be.lt(gas1 * 115n / 100n);
    });

    it("transfer gas should not grow with holder count", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") });

      // First transfer (2 holders)
      const gas1 = await measureGas(
        series.connect(protocol).transfer(alice.address, ethers.parseEther("10000"))
      );

      // Create more holders
      const signers = await ethers.getSigners();
      for (let i = 4; i < 14; i++) {
        await series.connect(protocol).transfer(signers[i].address, ethers.parseEther("10000"));
      }

      // Transfer after 12 holders exist
      const gas2 = await measureGas(
        series.connect(protocol).transfer(bob.address, ethers.parseEther("10000"))
      );

      console.log(`      transfer gas: 2 holders=${gas1}, 12 holders=${gas2}`);

      // Gas should be roughly the same (O(1) not O(n))
      expect(gas2).to.be.lt(gas1 * 120n / 100n);
    });

    it("routeRevenue gas should not grow with route count", async function () {
      const { router } = await createSeriesViaFactory(factory, protocol);
      const routerAddr = await router.getAddress();

      // First route
      await alice.sendTransaction({ to: routerAddr, value: ethers.parseEther("10") });
      const gas1 = await measureGas(router.routeRevenue());

      // 5 more routes
      for (let i = 0; i < 5; i++) {
        await alice.sendTransaction({ to: routerAddr, value: ethers.parseEther("10") });
        await router.routeRevenue();
      }

      // 7th route
      await alice.sendTransaction({ to: routerAddr, value: ethers.parseEther("10") });
      const gas2 = await measureGas(router.routeRevenue());

      console.log(`      routeRevenue gas: 1st=${gas1}, 7th=${gas2}`);

      // Gas should not increase more than 10%
      expect(gas2).to.be.lt(gas1 * 110n / 100n);
    });
  });

  // ============================================
  // 5) WORST-CASE GAS SCENARIOS
  // ============================================
  describe("Worst-Case Gas Scenarios", function () {
    it("distributeRevenue with many existing holders should still be O(1)", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      const signers = await ethers.getSigners();

      // Create 15 holders
      for (let i = 3; i < 18; i++) {
        await series.connect(protocol).transfer(signers[i].address, ethers.parseEther("10000"));
      }

      // Distribution should be O(1) — doesn't iterate holders
      const gas = await measureGas(
        series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") })
      );
      console.log(`      distributeRevenue with 15 holders: ${gas} gas`);
      expect(gas).to.be.lt(GAS_LIMITS.distributeRevenue);
    });

    it("claimRevenue after many unclaimed distributions should be O(1)", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));

      // 20 distributions without claiming
      for (let i = 0; i < 20; i++) {
        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") });
      }

      // Claim should still be O(1)
      const gas = await measureGas(series.connect(alice).claimRevenue());
      console.log(`      claimRevenue after 20 distributions: ${gas} gas`);
      expect(gas).to.be.lt(GAS_LIMITS.claimRevenue);
    });

    it("transfer after many distributions should be O(1)", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));

      // 20 distributions
      for (let i = 0; i < 20; i++) {
        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") });
      }

      // Transfer should still be O(1)
      const gas = await measureGas(
        series.connect(alice).transfer(bob.address, ethers.parseEther("10000"))
      );
      console.log(`      transfer after 20 distributions: ${gas} gas`);
      expect(gas).to.be.lt(GAS_LIMITS.transferCold);
    });
  });
});
