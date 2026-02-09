const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFullStack, createSeriesViaFactory, DEFAULT_PARAMS } = require("./helpers");

/**
 * POLICY DRIFT TESTS
 * 
 * Tests that verify correct behavior when policies are:
 * - Swapped mid-cycle (fee, safety, access)
 * - Disabled (set to address(0)) and behavior returns to default
 * - Paused/unpaused and only the right operations are blocked
 * 
 * The common bug: "I swapped a policy and broke a code path"
 */
describe("Policy Drift & Configuration Changes", function () {
  let owner, treasury, protocol, rest, registry, factory;
  let alice, bob;

  beforeEach(async function () {
    ({ owner, treasury, protocol, rest, registry, factory } = await deployFullStack());
    [alice, bob] = rest;
  });

  // ============================================
  // 1) FEE POLICY SWAP MID-CYCLE
  // ============================================
  describe("Fee Policy Swap Mid-Cycle", function () {
    it("Should create series without fee, then with fee after policy set", async function () {
      // Create series 1: no fee policy
      const { series: s1 } = await createSeriesViaFactory(factory, protocol, {
        name: "No Fee Series", symbol: "NF",
      });
      expect(await s1.totalSupply()).to.be.gt(0);

      // Set fee policy
      const FeePolicy = await ethers.getContractFactory("SimpleFeePolicy");
      const feePolicy = await FeePolicy.deploy(ethers.parseEther("0.01"), treasury.address);
      await factory.setFeePolicy(await feePolicy.getAddress());

      // Create series 2: requires fee
      await expect(
        factory.connect(protocol).createSeries(
          "Fee Series", "FS", protocol.address,
          2000, 180, ethers.parseEther("100000"), ethers.parseEther("0.001")
        )
      ).to.be.revertedWith("Insufficient fee");

      // With correct fee
      const { series: s2 } = await createSeriesViaFactory(factory, protocol, {
        name: "Fee Series", symbol: "FS",
        value: ethers.parseEther("0.01"),
      });
      expect(await s2.totalSupply()).to.be.gt(0);
    });

    it("Should handle fee policy swap between two different fee policies", async function () {
      const FeePolicy = await ethers.getContractFactory("SimpleFeePolicy");

      // Policy A: 0.01 ETH fee
      const policyA = await FeePolicy.deploy(ethers.parseEther("0.01"), treasury.address);
      await factory.setFeePolicy(await policyA.getAddress());

      await createSeriesViaFactory(factory, protocol, {
        name: "A", symbol: "A", value: ethers.parseEther("0.01"),
      });

      // Swap to Policy B: 0.05 ETH fee
      const policyB = await FeePolicy.deploy(ethers.parseEther("0.05"), treasury.address);
      await factory.setFeePolicy(await policyB.getAddress());

      // Old fee should fail
      await expect(
        factory.connect(protocol).createSeries(
          "B", "B", protocol.address,
          2000, 180, ethers.parseEther("100000"), ethers.parseEther("0.001"),
          { value: ethers.parseEther("0.01") }
        )
      ).to.be.revertedWith("Insufficient fee");

      // New fee works
      await createSeriesViaFactory(factory, protocol, {
        name: "B", symbol: "B", value: ethers.parseEther("0.05"),
      });
    });

    it("Should disable fee policy and return to free creation", async function () {
      const FeePolicy = await ethers.getContractFactory("SimpleFeePolicy");
      const feePolicy = await FeePolicy.deploy(ethers.parseEther("0.01"), treasury.address);
      await factory.setFeePolicy(await feePolicy.getAddress());

      // Requires fee
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address,
          2000, 180, ethers.parseEther("100000"), ethers.parseEther("0.001")
        )
      ).to.be.revertedWith("Insufficient fee");

      // Disable fee policy
      await factory.setFeePolicy(ethers.ZeroAddress);

      // Free again
      const { series } = await createSeriesViaFactory(factory, protocol, {
        name: "Free Again", symbol: "FREE",
      });
      expect(await series.totalSupply()).to.be.gt(0);
    });

    it("Should refund excess ETH even after fee policy swap", async function () {
      const FeePolicy = await ethers.getContractFactory("SimpleFeePolicy");
      const feePolicy = await FeePolicy.deploy(ethers.parseEther("0.01"), treasury.address);
      await factory.setFeePolicy(await feePolicy.getAddress());

      const balBefore = await ethers.provider.getBalance(protocol.address);

      // Send 1 ETH, fee is 0.01 ETH — should refund 0.99 ETH
      const tx = await factory.connect(protocol).createSeries(
        "Refund", "REF", protocol.address,
        2000, 180, ethers.parseEther("100000"), ethers.parseEther("0.001"),
        { value: ethers.parseEther("1") }
      );
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const balAfter = await ethers.provider.getBalance(protocol.address);
      const spent = balBefore - balAfter - gasCost;

      // Should have spent ~0.01 ETH (fee), not 1 ETH
      expect(spent).to.be.closeTo(ethers.parseEther("0.01"), ethers.parseEther("0.001"));
    });

    it("Existing series should work normally after fee policy change", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Change fee policy
      const FeePolicy = await ethers.getContractFactory("SimpleFeePolicy");
      const feePolicy = await FeePolicy.deploy(ethers.parseEther("1"), treasury.address);
      await factory.setFeePolicy(await feePolicy.getAddress());

      // Existing series operations unaffected
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("5") });
      const claimable = await series.calculateClaimable(alice.address);
      expect(claimable).to.be.gt(0);
      await series.connect(alice).claimRevenue();
    });
  });

  // ============================================
  // 2) SAFETY POLICY SWAP MID-CYCLE
  // ============================================
  describe("Safety Policy Swap Mid-Cycle", function () {
    it("Should enforce stricter limits after safety policy set", async function () {
      // Without policy: BPS 4000 is fine (core max = 5000)
      await createSeriesViaFactory(factory, protocol, {
        name: "Loose", symbol: "L", revenueShareBPS: 4000,
      });

      // Set strict policy (max 3000 BPS)
      const StrictPolicy = await ethers.getContractFactory("StrictSafetyPolicy");
      const strictPolicy = await StrictPolicy.deploy();
      await factory.setSafetyPolicy(await strictPolicy.getAddress());

      // BPS 4000 now fails
      await expect(
        factory.connect(protocol).createSeries(
          "Strict", "S", protocol.address,
          4000, 180, ethers.parseEther("100000"), ethers.parseEther("0.001")
        )
      ).to.be.revertedWith("Revenue share too high for strict policy");

      // BPS 3000 works
      await createSeriesViaFactory(factory, protocol, {
        name: "Strict OK", symbol: "SOK", revenueShareBPS: 3000,
      });
    });

    it("Should enforce stricter duration limits after safety policy set", async function () {
      // Without policy: 30 days is fine (core min = 30)
      await createSeriesViaFactory(factory, protocol, {
        name: "Short", symbol: "SH", durationDays: 30,
      });

      // Set strict policy (min 90 days)
      const StrictPolicy = await ethers.getContractFactory("StrictSafetyPolicy");
      const strictPolicy = await StrictPolicy.deploy();
      await factory.setSafetyPolicy(await strictPolicy.getAddress());

      // 30 days now fails
      await expect(
        factory.connect(protocol).createSeries(
          "Too Short", "TS", protocol.address,
          2000, 30, ethers.parseEther("100000"), ethers.parseEther("0.001")
        )
      ).to.be.revertedWith("Duration too short for strict policy");

      // 90 days works
      await createSeriesViaFactory(factory, protocol, {
        name: "OK Duration", symbol: "OD", durationDays: 90,
      });
    });

    it("Should return to default limits after safety policy disabled", async function () {
      const StrictPolicy = await ethers.getContractFactory("StrictSafetyPolicy");
      const strictPolicy = await StrictPolicy.deploy();
      await factory.setSafetyPolicy(await strictPolicy.getAddress());

      // 30 days fails with strict
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address,
          2000, 30, ethers.parseEther("100000"), ethers.parseEther("0.001")
        )
      ).to.be.revertedWith("Duration too short for strict policy");

      // Disable safety policy
      await factory.setSafetyPolicy(ethers.ZeroAddress);

      // 30 days works again (core allows it)
      await createSeriesViaFactory(factory, protocol, {
        name: "Back to Default", symbol: "BTD", durationDays: 30,
      });
    });

    it("Existing series unaffected by safety policy change", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol, {
        revenueShareBPS: 4000,
      });

      // Set strict policy (max 3000 BPS)
      const StrictPolicy = await ethers.getContractFactory("StrictSafetyPolicy");
      const strictPolicy = await StrictPolicy.deploy();
      await factory.setSafetyPolicy(await strictPolicy.getAddress());

      // Existing 4000 BPS series still works fine
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      await series.connect(alice).claimRevenue();
    });
  });

  // ============================================
  // 3) ACCESS POLICY SWAP MID-CYCLE
  // ============================================
  describe("Access Policy Swap Mid-Cycle", function () {
    it("Should block non-whitelisted after access policy set", async function () {
      // Permissionless: anyone can create
      await createSeriesViaFactory(factory, protocol, { name: "Open", symbol: "O" });

      // Set whitelist policy
      const WhitelistPolicy = await ethers.getContractFactory("WhitelistAccessPolicy");
      const accessPolicy = await WhitelistPolicy.deploy();
      await factory.setAccessPolicy(await accessPolicy.getAddress());

      // Protocol not whitelisted — blocked
      await expect(
        factory.connect(protocol).createSeries(
          "Blocked", "BL", protocol.address,
          2000, 180, ethers.parseEther("100000"), ethers.parseEther("0.001")
        )
      ).to.be.revertedWith("Access denied by policy");

      // Whitelist protocol
      await accessPolicy.addToWhitelist(protocol.address);

      // Now works
      await createSeriesViaFactory(factory, protocol, { name: "Allowed", symbol: "AL" });
    });

    it("Should return to permissionless after access policy disabled", async function () {
      const WhitelistPolicy = await ethers.getContractFactory("WhitelistAccessPolicy");
      const accessPolicy = await WhitelistPolicy.deploy();
      await factory.setAccessPolicy(await accessPolicy.getAddress());

      // Blocked
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address,
          2000, 180, ethers.parseEther("100000"), ethers.parseEther("0.001")
        )
      ).to.be.revertedWith("Access denied by policy");

      // Disable access policy
      await factory.setAccessPolicy(ethers.ZeroAddress);

      // Permissionless again
      await createSeriesViaFactory(factory, protocol, { name: "Free", symbol: "F" });
    });

    it("Should handle whitelist removal mid-cycle", async function () {
      const WhitelistPolicy = await ethers.getContractFactory("WhitelistAccessPolicy");
      const accessPolicy = await WhitelistPolicy.deploy();
      await factory.setAccessPolicy(await accessPolicy.getAddress());
      await accessPolicy.addToWhitelist(protocol.address);

      // Create first series
      const { series: s1 } = await createSeriesViaFactory(factory, protocol, { name: "S1", symbol: "S1" });

      // Remove from whitelist
      await accessPolicy.removeFromWhitelist(protocol.address);

      // Can't create new series
      await expect(
        factory.connect(protocol).createSeries(
          "S2", "S2", protocol.address,
          2000, 180, ethers.parseEther("100000"), ethers.parseEther("0.001")
        )
      ).to.be.revertedWith("Access denied by policy");

      // But existing series still works
      await s1.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") });
    });

    it("Existing series unaffected by access policy change", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Set restrictive access policy
      const WhitelistPolicy = await ethers.getContractFactory("WhitelistAccessPolicy");
      const accessPolicy = await WhitelistPolicy.deploy();
      await factory.setAccessPolicy(await accessPolicy.getAddress());

      // Existing series operations still work
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("5") });
      await series.connect(alice).claimRevenue();
    });
  });

  // ============================================
  // 4) COMBINED POLICY CHANGES
  // ============================================
  describe("Combined Policy Changes", function () {
    it("Should handle all three policies set simultaneously", async function () {
      const FeePolicy = await ethers.getContractFactory("SimpleFeePolicy");
      const feePolicy = await FeePolicy.deploy(ethers.parseEther("0.01"), treasury.address);

      const StrictPolicy = await ethers.getContractFactory("StrictSafetyPolicy");
      const strictPolicy = await StrictPolicy.deploy();

      const WhitelistPolicy = await ethers.getContractFactory("WhitelistAccessPolicy");
      const accessPolicy = await WhitelistPolicy.deploy();

      await factory.setFeePolicy(await feePolicy.getAddress());
      await factory.setSafetyPolicy(await strictPolicy.getAddress());
      await factory.setAccessPolicy(await accessPolicy.getAddress());
      await accessPolicy.addToWhitelist(protocol.address);

      // Must satisfy ALL three policies
      const { series } = await createSeriesViaFactory(factory, protocol, {
        name: "Triple Policy", symbol: "TP",
        revenueShareBPS: 2000,
        durationDays: 180,
        totalSupply: ethers.parseEther("100000"),
        value: ethers.parseEther("0.01"),
      });
      expect(await series.totalSupply()).to.be.gt(0);
    });

    it("Should handle disabling all policies back to defaults", async function () {
      // Set all policies
      const FeePolicy = await ethers.getContractFactory("SimpleFeePolicy");
      const feePolicy = await FeePolicy.deploy(ethers.parseEther("0.01"), treasury.address);
      const StrictPolicy = await ethers.getContractFactory("StrictSafetyPolicy");
      const strictPolicy = await StrictPolicy.deploy();
      const WhitelistPolicy = await ethers.getContractFactory("WhitelistAccessPolicy");
      const accessPolicy = await WhitelistPolicy.deploy();

      await factory.setFeePolicy(await feePolicy.getAddress());
      await factory.setSafetyPolicy(await strictPolicy.getAddress());
      await factory.setAccessPolicy(await accessPolicy.getAddress());

      // Disable all
      await factory.setFeePolicy(ethers.ZeroAddress);
      await factory.setSafetyPolicy(ethers.ZeroAddress);
      await factory.setAccessPolicy(ethers.ZeroAddress);

      // Back to permissionless, free, default limits
      await createSeriesViaFactory(factory, protocol, {
        name: "Default", symbol: "DEF",
        revenueShareBPS: 5000,
        durationDays: 30,
      });
    });

    it("Should emit correct events for all policy changes", async function () {
      const FeePolicy = await ethers.getContractFactory("SimpleFeePolicy");
      const feePolicy = await FeePolicy.deploy(ethers.parseEther("0.01"), treasury.address);
      const feePolicyAddr = await feePolicy.getAddress();

      await expect(factory.setFeePolicy(feePolicyAddr))
        .to.emit(factory, "FeePolicyUpdated")
        .withArgs(ethers.ZeroAddress, feePolicyAddr);

      await expect(factory.setFeePolicy(ethers.ZeroAddress))
        .to.emit(factory, "FeePolicyUpdated")
        .withArgs(feePolicyAddr, ethers.ZeroAddress);

      const StrictPolicy = await ethers.getContractFactory("StrictSafetyPolicy");
      const strictPolicy = await StrictPolicy.deploy();
      const strictAddr = await strictPolicy.getAddress();

      await expect(factory.setSafetyPolicy(strictAddr))
        .to.emit(factory, "SafetyPolicyUpdated")
        .withArgs(ethers.ZeroAddress, strictAddr);

      const WhitelistPolicy = await ethers.getContractFactory("WhitelistAccessPolicy");
      const accessPolicy = await WhitelistPolicy.deploy();
      const accessAddr = await accessPolicy.getAddress();

      await expect(factory.setAccessPolicy(accessAddr))
        .to.emit(factory, "AccessPolicyUpdated")
        .withArgs(ethers.ZeroAddress, accessAddr);
    });
  });

  // ============================================
  // 5) PAUSE/UNPAUSE GRANULARITY
  // ============================================
  describe("Pause/Unpause Granularity", function () {
    it("Factory pause should block series creation only", async function () {
      const { series, router } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));

      // Pause factory
      await factory.pause();

      // Series creation blocked
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address,
          2000, 180, ethers.parseEther("100000"), ethers.parseEther("0.001")
        )
      ).to.be.reverted;

      // But existing series operations still work
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      await series.connect(alice).claimRevenue();

      // Router operations still work
      await router.connect(alice).receiveAndRoute({ value: ethers.parseEther("5") });
    });

    it("Factory unpause should restore creation", async function () {
      await factory.pause();

      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address,
          2000, 180, ethers.parseEther("100000"), ethers.parseEther("0.001")
        )
      ).to.be.reverted;

      await factory.unpause();

      await createSeriesViaFactory(factory, protocol, { name: "Unpaused", symbol: "UP" });
    });

    it("Router pause should block routing but not receiving", async function () {
      const { series, router } = await createSeriesViaFactory(factory, protocol);

      // Pause router
      await router.connect(protocol).pause();

      // Receiving ETH still works (receive() is not whenNotPaused)
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
      expect(await router.pendingToRoute()).to.equal(ethers.parseEther("10"));

      // Routing blocked
      await expect(router.routeRevenue()).to.be.reverted;

      // receiveAndRoute blocked
      await expect(
        router.connect(alice).receiveAndRoute({ value: ethers.parseEther("5") })
      ).to.be.reverted;

      // Unpause and route
      await router.connect(protocol).unpause();
      await router.routeRevenue();
      expect(await router.pendingToRoute()).to.equal(0);
    });

    it("Router pause should NOT block withdrawals", async function () {
      const { router } = await createSeriesViaFactory(factory, protocol);

      // Send and route first
      await router.connect(alice).receiveAndRoute({ value: ethers.parseEther("10") });

      // Pause router
      await router.connect(protocol).pause();

      // Withdrawal should still work (not whenNotPaused)
      const routerBalance = await ethers.provider.getBalance(await router.getAddress());
      if (routerBalance > 0n) {
        await expect(router.connect(protocol).withdrawAllToProtocol()).to.not.be.reverted;
      }
    });

    it("Router pause should NOT block emergency withdraw", async function () {
      const { router } = await createSeriesViaFactory(factory, protocol);

      // Send and route
      await router.connect(alice).receiveAndRoute({ value: ethers.parseEther("10") });

      // Pause
      await router.connect(protocol).pause();

      // Emergency withdraw should still work
      const routerBalance = await ethers.provider.getBalance(await router.getAddress());
      if (routerBalance > 0n) {
        await expect(router.connect(protocol).emergencyWithdraw(protocol.address)).to.not.be.reverted;
      }
    });

    it("Series operations should never be pausable (no pause on series)", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));

      // Factory paused
      await factory.pause();

      // All series operations work
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      await series.connect(alice).claimRevenue();
      await series.connect(protocol).transfer(bob.address, ethers.parseEther("10000"));
      await series.connect(bob).claimFor(alice.address).catch(() => {}); // may have nothing to claim

      await factory.unpause();
    });

    it("Double pause should revert", async function () {
      await factory.pause();
      await expect(factory.pause()).to.be.reverted;
    });

    it("Double unpause should revert", async function () {
      await expect(factory.unpause()).to.be.reverted;
    });
  });

  // ============================================
  // 6) TREASURY CHANGE MID-CYCLE
  // ============================================
  describe("Treasury Change Mid-Cycle", function () {
    it("Should route fees to new treasury after change", async function () {
      const FeePolicy = await ethers.getContractFactory("SimpleFeePolicy");
      const feePolicy = await FeePolicy.deploy(ethers.parseEther("0.01"), treasury.address);
      await factory.setFeePolicy(await feePolicy.getAddress());

      const treasuryBalBefore = await ethers.provider.getBalance(treasury.address);

      // Create with fee going to old treasury
      await createSeriesViaFactory(factory, protocol, {
        name: "Old Treasury", symbol: "OT", value: ethers.parseEther("0.01"),
      });

      const treasuryBalAfter = await ethers.provider.getBalance(treasury.address);
      expect(treasuryBalAfter - treasuryBalBefore).to.equal(ethers.parseEther("0.01"));

      // Change fee receiver in policy
      await feePolicy.setFeeReceiver(alice.address);

      const aliceBalBefore = await ethers.provider.getBalance(alice.address);

      // Create with fee going to new receiver
      await createSeriesViaFactory(factory, protocol, {
        name: "New Treasury", symbol: "NT", value: ethers.parseEther("0.01"),
      });

      const aliceBalAfter = await ethers.provider.getBalance(alice.address);
      expect(aliceBalAfter - aliceBalBefore).to.equal(ethers.parseEther("0.01"));
    });

    it("Should handle factory treasury change (for non-policy fees)", async function () {
      const oldTreasury = treasury.address;
      await expect(factory.setTreasury(alice.address))
        .to.emit(factory, "TreasuryUpdated")
        .withArgs(oldTreasury, alice.address);

      expect(await factory.treasury()).to.equal(alice.address);
    });
  });
});
