const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Reentrancy Protection Tests", function () {
  let series;
  let router;
  let protocol;
  let malicious;
  let alice;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const REVENUE_SHARE_BPS = 2000;
  const DURATION_DAYS = 365;

  beforeEach(async function () {
    [protocol, alice] = await ethers.getSigners();

    // Deploy series
    const RevenueSeries = await ethers.getContractFactory("RevenueSeries");
    series = await RevenueSeries.deploy(
      "Test Revenue Series",
      "TEST-REV",
      protocol.address,
      protocol.address, // Use protocol as router for simplicity
      REVENUE_SHARE_BPS,
      DURATION_DAYS,
      INITIAL_SUPPLY
    );

    // Deploy malicious contract
    const MaliciousReceiver = await ethers.getContractFactory("MaliciousReceiver");
    malicious = await MaliciousReceiver.deploy(await series.getAddress());
  });

  describe("claimRevenue() Reentrancy", function () {
    beforeEach(async function () {
      // Give malicious contract some tokens
      await series.connect(protocol).transfer(await malicious.getAddress(), ethers.parseEther("100000"));
      
      // Distribute revenue
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
    });

    it("Should protect against reentrancy in claimRevenue()", async function () {
      // Malicious contract tries to reenter but nonReentrant blocks it
      await malicious.attack();
      
      // Should have claimed only once (not reentered)
      expect(await series.calculateClaimable(await malicious.getAddress())).to.equal(0);
      
      // Attack count should be 0 (reentry was blocked)
      expect(await malicious.attackCount()).to.equal(0);
    });

    it("Should allow normal claim after reentrancy attempt", async function () {
      // Attack (will claim once)
      await malicious.attack();

      // No more claimable (already claimed)
      const claimable = await series.calculateClaimable(await malicious.getAddress());
      expect(claimable).to.equal(0);
      
      // New distribution
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("5") });
      
      // Should be able to claim new rewards
      const newClaimable = await series.calculateClaimable(await malicious.getAddress());
      expect(newClaimable).to.be.gt(0);
    });

    it("Should maintain correct state after reentrancy attempt", async function () {
      const totalRevenueBefore = await series.totalRevenueReceived();
      const revenuePerTokenBefore = await series.revenuePerTokenStored();

      await malicious.attack();

      // Revenue state should remain unchanged (only claim happened, no distribution)
      expect(await series.totalRevenueReceived()).to.equal(totalRevenueBefore);
      expect(await series.revenuePerTokenStored()).to.equal(revenuePerTokenBefore);
    });
  });

  describe("claimFor() Reentrancy", function () {
    beforeEach(async function () {
      await series.connect(protocol).transfer(await malicious.getAddress(), ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
    });

    it("Should protect against reentrancy in claimFor()", async function () {
      // Attack succeeds but doesn't reenter
      await malicious.attackClaimFor();
      
      // Should have claimed only once
      expect(await series.calculateClaimable(await malicious.getAddress())).to.equal(0);
    });

    it("Should not allow double claiming via reentrancy", async function () {
      const claimableBefore = await series.calculateClaimable(await malicious.getAddress());
      expect(claimableBefore).to.be.gt(0);

      await malicious.attack();

      const claimableAfter = await series.calculateClaimable(await malicious.getAddress());
      
      // Should have claimed once (not double)
      expect(claimableAfter).to.equal(0);
    });
  });

  describe("distributeRevenue() Reentrancy", function () {
    it("Should protect distributeRevenue from reentrancy", async function () {
      // Even if a malicious contract is involved, distributeRevenue should be safe
      await series.connect(protocol).transfer(await malicious.getAddress(), ethers.parseEther("100000"));

      // Multiple distributions should work fine
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("5") });
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("5") });
      
      expect(await series.totalRevenueReceived()).to.equal(ethers.parseEther("10"));
    });
  });

  describe("Transfer Reentrancy", function () {
    beforeEach(async function () {
      await series.connect(protocol).transfer(await malicious.getAddress(), ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
    });

    it("Should handle transfers to/from malicious contracts safely", async function () {
      // Transfer from malicious contract should work
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("50000"));
      
      // Transfer to malicious contract should work
      await series.connect(alice).transfer(await malicious.getAddress(), ethers.parseEther("10000"));
      
      expect(await series.balanceOf(await malicious.getAddress())).to.equal(ethers.parseEther("110000"));
    });

    it("Should update rewards correctly even with malicious receiver", async function () {
      const rewardsBefore = await series.rewards(await malicious.getAddress());
      
      // Transfer should trigger _updateRewards
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("10000"));
      
      // Malicious contract's rewards should be updated
      const rewardsAfter = await series.rewards(await malicious.getAddress());
      expect(rewardsAfter).to.be.gte(rewardsBefore);
    });
  });

  describe("Complex Reentrancy Scenarios", function () {
    it("Should handle multiple malicious contracts", async function () {
      const MaliciousReceiver = await ethers.getContractFactory("MaliciousReceiver");
      const malicious2 = await MaliciousReceiver.deploy(await series.getAddress());

      await series.connect(protocol).transfer(await malicious.getAddress(), ethers.parseEther("100000"));
      await series.connect(protocol).transfer(await malicious2.getAddress(), ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Both can claim but not reenter
      await malicious.attack();
      await malicious2.attack();
      
      // Both should have claimed
      expect(await series.calculateClaimable(await malicious.getAddress())).to.equal(0);
      expect(await series.calculateClaimable(await malicious2.getAddress())).to.equal(0);
    });

    it("Should protect against cross-function reentrancy", async function () {
      await series.connect(protocol).transfer(await malicious.getAddress(), ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Try to reenter via different function (nonReentrant protects all)
      await malicious.attack();
      
      // Should have claimed only once
      expect(await series.calculateClaimable(await malicious.getAddress())).to.equal(0);
      
      // Attack count should be 0 (reentry was blocked)
      expect(await malicious.attackCount()).to.equal(0);
    });
  });

  describe("Legitimate Multi-Call Patterns", function () {
    it("Should allow legitimate sequential claims", async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      
      // First distribution
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      await series.connect(alice).claimRevenue();
      
      // Second distribution
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      await series.connect(alice).claimRevenue();
      
      // Should work fine (not reentrancy, just sequential calls)
      expect(await series.rewards(alice.address)).to.equal(0);
    });

    it("Should allow claim after transfer in same block", async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Transfer then claim in sequence (not reentrancy)
      await series.connect(alice).transfer(protocol.address, ethers.parseEther("10000"));
      await series.connect(alice).claimRevenue();
      
      expect(await series.rewards(alice.address)).to.equal(0);
    });
  });
});
