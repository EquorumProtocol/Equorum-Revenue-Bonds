const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Critical Attack Vectors - Mainnet Security", function () {
  let series, router;
  let protocol, alice, bob, attacker;
  let rejectETH, maliciousSeries;
  
  const REVENUE_SHARE_BPS = 2000; // 20%
  const DURATION_DAYS = 365;
  const INITIAL_SUPPLY = ethers.parseEther("1000000");

  beforeEach(async function () {
    [protocol, alice, bob, attacker] = await ethers.getSigners();

    // Deploy router first
    const RevenueRouter = await ethers.getContractFactory("RevenueRouter");
    router = await RevenueRouter.deploy(
      protocol.address,
      ethers.ZeroAddress,
      REVENUE_SHARE_BPS
    );
    await router.waitForDeployment();

    // Deploy series
    const RevenueSeries = await ethers.getContractFactory("RevenueSeries");
    series = await RevenueSeries.deploy(
      "Test Revenue Series",
      "TEST-REV",
      protocol.address,
      await router.getAddress(),
      REVENUE_SHARE_BPS,
      DURATION_DAYS,
      INITIAL_SUPPLY
    );
    await series.waitForDeployment();

    // Update router with series address
    await router.updateSeriesAddress(await series.getAddress());
  });

  describe("Attack 1: Claim Reverter (ETH Rejection)", function () {
    beforeEach(async function () {
      // Deploy RejectETH contract
      const RejectETH = await ethers.getContractFactory("RejectETH");
      rejectETH = await RejectETH.deploy(await series.getAddress());

      // Give tokens to RejectETH
      await series.connect(protocol).transfer(await rejectETH.getAddress(), ethers.parseEther("100000"));

      // Distribute revenue
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
    });

    it("🚨 CRITICAL: Should NOT lose rewards if ETH transfer fails", async function () {
      // RejectETH has claimable rewards
      const claimableBefore = await series.calculateClaimable(await rejectETH.getAddress());
      expect(claimableBefore).to.be.gt(0);

      const rewardsBefore = await series.rewards(await rejectETH.getAddress());
      
      // Attempt to claim (should revert because receive() rejects)
      await expect(
        rejectETH.attemptClaim()
      ).to.be.revertedWith("Transfer failed");

      // ✅ CRITICAL CHECK: Rewards should NOT be lost
      const claimableAfter = await series.calculateClaimable(await rejectETH.getAddress());
      const rewardsAfter = await series.rewards(await rejectETH.getAddress());
      
      // If this fails, you have a CRITICAL BUG - user loses funds permanently
      expect(claimableAfter).to.equal(claimableBefore, "❌ BUG: Rewards were lost!");
      expect(rewardsAfter).to.equal(rewardsBefore, "❌ BUG: Rewards state corrupted!");
    });

    it("Should allow claim after fixing ETH rejection", async function () {
      // First attempt fails
      await expect(rejectETH.attemptClaim()).to.be.revertedWith("Transfer failed");

      // Fix the contract to accept ETH
      await rejectETH.setShouldReject(false);

      // Now claim should work
      const claimable = await series.calculateClaimable(await rejectETH.getAddress());
      await expect(rejectETH.attemptClaim()).to.not.be.reverted;

      // Rewards should be claimed
      expect(await series.calculateClaimable(await rejectETH.getAddress())).to.equal(0);
      expect(await ethers.provider.getBalance(await rejectETH.getAddress())).to.equal(claimable);
    });

    it("Should handle multiple failed claim attempts without state corruption", async function () {
      const initialClaimable = await series.calculateClaimable(await rejectETH.getAddress());

      // Multiple failed attempts
      for (let i = 0; i < 3; i++) {
        await expect(rejectETH.attemptClaim()).to.be.revertedWith("Transfer failed");
        
        // State should remain consistent
        expect(await series.calculateClaimable(await rejectETH.getAddress())).to.equal(initialClaimable);
      }

      // New distribution
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("5") });

      // Claimable should increase
      const newClaimable = await series.calculateClaimable(await rejectETH.getAddress());
      expect(newClaimable).to.be.gt(initialClaimable);

      // Still can't claim
      await expect(rejectETH.attemptClaim()).to.be.revertedWith("Transfer failed");
      expect(await series.calculateClaimable(await rejectETH.getAddress())).to.equal(newClaimable);
    });
  });

  describe("Attack 2: Real Reentrancy (Claim Loop)", function () {
    let maliciousReceiver;

    beforeEach(async function () {
      // Use existing MaliciousReceiver
      const MaliciousReceiver = await ethers.getContractFactory("MaliciousReceiver");
      maliciousReceiver = await MaliciousReceiver.deploy(await series.getAddress());

      await series.connect(protocol).transfer(await maliciousReceiver.getAddress(), ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
    });

    it("✅ Should block reentrancy completely", async function () {
      const claimableBefore = await series.calculateClaimable(await maliciousReceiver.getAddress());
      expect(claimableBefore).to.be.gt(0);

      // Attack should succeed but not reenter
      await maliciousReceiver.attack();

      // Should have claimed exactly once
      expect(await series.calculateClaimable(await maliciousReceiver.getAddress())).to.equal(0);
      
      // Attack count should be 0 (reentrancy was blocked)
      expect(await maliciousReceiver.attackCount()).to.equal(0);
    });

    it("Should not allow any state corruption via reentrancy", async function () {
      const totalSupply = await series.totalSupply();
      const totalRevenue = await series.totalRevenueReceived();

      await maliciousReceiver.attack();

      // Invariants should hold
      expect(await series.totalSupply()).to.equal(totalSupply);
      expect(await series.totalRevenueReceived()).to.equal(totalRevenue);
    });

    it("Should handle reentrancy via claimFor", async function () {
      await maliciousReceiver.attackClaimFor();

      expect(await series.calculateClaimable(await maliciousReceiver.getAddress())).to.equal(0);
    });
  });

  describe("Attack 3: Malicious Series (Router Resilience)", function () {
    beforeEach(async function () {
      const MaliciousSeries = await ethers.getContractFactory("MaliciousSeries");
      maliciousSeries = await MaliciousSeries.deploy();

      // Create new router pointing to malicious series
      const RevenueRouter = await ethers.getContractFactory("RevenueRouter");
      router = await RevenueRouter.deploy(
        protocol.address,
        await maliciousSeries.getAddress(),
        REVENUE_SHARE_BPS
      );
    });

    it("✅ Should handle gas-consuming series without losing funds", async function () {
      await maliciousSeries.setAttackType(0); // CONSUME_GAS

      // Send ETH to router
      await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });

      // Route - even if gas is consumed, funds should be safe
      await router.routeRevenue();

      // CRITICAL: Protocol can always withdraw their funds
      // Even if series misbehaves, protocol's share is never lost
      const routerBalance = await ethers.provider.getBalance(await router.getAddress());
      expect(routerBalance).to.be.gt(0); // Router has funds
      
      // Protocol can withdraw
      await router.connect(protocol).withdrawAllToProtocol();
      
      // After withdrawal, router should be empty or near-empty
      expect(await ethers.provider.getBalance(await router.getAddress())).to.be.lt(ethers.parseEther("0.1"));
    });

    it("✅ Should handle always-reverting series", async function () {
      await maliciousSeries.setAttackType(1); // REVERT_ALWAYS

      await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });

      const balanceBefore = await ethers.provider.getBalance(await router.getAddress());

      // Route should catch revert
      await router.routeRevenue();

      // Funds should stay in router
      expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(balanceBefore);
      expect(await router.failedRouteCount()).to.equal(1);
    });

    it("✅ Should handle huge revert reasons", async function () {
      await maliciousSeries.setAttackType(2); // REVERT_WITH_HUGE_REASON

      await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });

      const balanceBefore = await ethers.provider.getBalance(await router.getAddress());

      // Should not run out of gas
      await router.routeRevenue();

      // Funds should stay in router
      expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(balanceBefore);
      expect(await router.failedRouteCount()).to.equal(1);
    });

    it("✅ Should allow protocol to withdraw stuck funds", async function () {
      await maliciousSeries.setAttackType(1); // REVERT_ALWAYS

      await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
      await router.routeRevenue();

      // Funds are stuck in router, but protocol can withdraw
      const protocolBalanceBefore = await ethers.provider.getBalance(protocol.address);
      
      await router.connect(protocol).withdrawAllToProtocol();

      const protocolBalanceAfter = await ethers.provider.getBalance(protocol.address);
      expect(protocolBalanceAfter).to.be.gt(protocolBalanceBefore);
    });

    it("✅ Should handle series that appears active but always reverts", async function () {
      await maliciousSeries.setActive(true);
      await maliciousSeries.setAttackType(1); // REVERT_ALWAYS

      // getSeriesInfo says active=true
      const info = await maliciousSeries.getSeriesInfo();
      expect(info[5]).to.equal(true); // isActive

      // But distributeRevenue always reverts
      await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
      await router.routeRevenue();

      // Should handle gracefully
      expect(await router.failedRouteCount()).to.equal(1);
      expect(await ethers.provider.getBalance(await router.getAddress())).to.be.gt(0);
    });
  });

  describe("Invariant: Total Paid <= Total Received", function () {
    it("🔒 INVARIANT: Should never pay more than received", async function () {
      // Setup multiple holders
      await series.connect(protocol).transfer(await alice.getAddress(), ethers.parseEther("100000"));
      await series.connect(protocol).transfer(await bob.getAddress(), ethers.parseEther("50000"));
      await series.connect(protocol).transfer(await attacker.getAddress(), ethers.parseEther("50000"));

      let totalPaid = 0n;

      // Multiple distribution cycles
      for (let i = 0; i < 5; i++) {
        const amount = ethers.parseEther((10 + i * 5).toString());
        await series.connect(protocol).distributeRevenue({ value: amount });

        // Random claims
        if (i % 2 === 0) {
          const aliceClaimable = await series.calculateClaimable(await alice.getAddress());
          if (aliceClaimable > 0) {
            await series.connect(alice).claimRevenue();
            totalPaid += aliceClaimable;
          }
        }

        if (i % 3 === 0) {
          const bobClaimable = await series.calculateClaimable(await bob.getAddress());
          if (bobClaimable > 0) {
            await series.connect(bob).claimRevenue();
            totalPaid += bobClaimable;
          }
        }
      }

      // Final claims
      const aliceClaimable = await series.calculateClaimable(await alice.getAddress());
      const bobClaimable = await series.calculateClaimable(await bob.getAddress());
      const attackerClaimable = await series.calculateClaimable(await attacker.getAddress());
      const protocolClaimable = await series.calculateClaimable(await protocol.getAddress());

      const totalClaimable = aliceClaimable + bobClaimable + attackerClaimable + protocolClaimable;
      const totalReceived = await series.totalRevenueReceived();

      // 🔒 CRITICAL INVARIANT
      expect(totalPaid + totalClaimable).to.be.lte(totalReceived, 
        "❌ CRITICAL BUG: Protocol pays more than it received!");

      // Additional check: contract balance should cover all claimable
      const contractBalance = await ethers.provider.getBalance(await series.getAddress());
      expect(contractBalance).to.be.gte(totalClaimable,
        "❌ CRITICAL BUG: Not enough balance to cover claimable rewards!");
    });

    it("🔒 Should maintain invariant with transfers", async function () {
      await series.connect(protocol).transfer(await alice.getAddress(), ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Alice claims
      await series.connect(alice).claimRevenue();

      // Alice transfers to Bob
      await series.connect(alice).transfer(await bob.getAddress(), ethers.parseEther("50000"));

      // More distributions
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("20") });

      // Check invariant
      const aliceClaimable = await series.calculateClaimable(await alice.getAddress());
      const bobClaimable = await series.calculateClaimable(await bob.getAddress());
      const protocolClaimable = await series.calculateClaimable(await protocol.getAddress());

      const totalClaimable = aliceClaimable + bobClaimable + protocolClaimable;
      const totalReceived = await series.totalRevenueReceived();
      const contractBalance = await ethers.provider.getBalance(await series.getAddress());

      expect(totalClaimable).to.be.lte(totalReceived);
      expect(contractBalance).to.be.gte(totalClaimable);
    });
  });
});
