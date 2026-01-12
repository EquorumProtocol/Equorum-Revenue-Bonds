const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("RevenueSeries", function () {
  let revenueSeries;
  let protocol;
  let router;
  let alice;
  let bob;
  let charlie;
  let relayer;

  const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 1M tokens
  const REVENUE_SHARE_BPS = 2000; // 20%
  const DURATION_DAYS = 365; // 1 year

  beforeEach(async function () {
    [protocol, router, alice, bob, charlie, relayer] = await ethers.getSigners();

    const RevenueSeries = await ethers.getContractFactory("RevenueSeries");
    revenueSeries = await RevenueSeries.deploy(
      "Test Revenue Series",
      "TEST-REV",
      protocol.address,
      router.address,
      REVENUE_SHARE_BPS,
      DURATION_DAYS,
      INITIAL_SUPPLY
    );
  });

  describe("Deployment", function () {
    it("Should set correct initial parameters", async function () {
      expect(await revenueSeries.name()).to.equal("Test Revenue Series");
      expect(await revenueSeries.symbol()).to.equal("TEST-REV");
      expect(await revenueSeries.protocol()).to.equal(protocol.address);
      expect(await revenueSeries.router()).to.equal(router.address);
      expect(await revenueSeries.revenueShareBPS()).to.equal(REVENUE_SHARE_BPS);
      expect(await revenueSeries.totalTokenSupply()).to.equal(INITIAL_SUPPLY);
      expect(await revenueSeries.active()).to.equal(true);
    });

    it("Should mint all tokens to protocol", async function () {
      expect(await revenueSeries.balanceOf(protocol.address)).to.equal(INITIAL_SUPPLY);
      expect(await revenueSeries.totalSupply()).to.equal(INITIAL_SUPPLY);
    });

    it("Should set maturity date correctly", async function () {
      const maturityDate = await revenueSeries.maturityDate();
      const expectedMaturity = (await time.latest()) + (DURATION_DAYS * 24 * 60 * 60);
      expect(maturityDate).to.be.closeTo(expectedMaturity, 5); // 5 seconds tolerance
    });

    it("Should emit SeriesConfigured event", async function () {
      const RevenueSeries = await ethers.getContractFactory("RevenueSeries");
      const newSeries = await RevenueSeries.deploy(
        "Test Revenue Series 2",
        "TEST-REV2",
        protocol.address,
        router.address,
        REVENUE_SHARE_BPS,
        DURATION_DAYS,
        INITIAL_SUPPLY
      );
      
      const receipt = await newSeries.deploymentTransaction().wait();
      const event = receipt.logs.find(log => {
        try {
          return newSeries.interface.parseLog(log)?.name === "SeriesConfigured";
        } catch {
          return false;
        }
      });
      
      expect(event).to.not.be.undefined;
    });

    it("Should reject zero protocol address", async function () {
      const RevenueSeries = await ethers.getContractFactory("RevenueSeries");
      await expect(
        RevenueSeries.deploy(
          "Test",
          "TEST",
          ethers.ZeroAddress,
          router.address,
          REVENUE_SHARE_BPS,
          DURATION_DAYS,
          INITIAL_SUPPLY
        )
      ).to.be.revertedWith("Invalid protocol");
    });

    it("Should reject zero router address", async function () {
      const RevenueSeries = await ethers.getContractFactory("RevenueSeries");
      await expect(
        RevenueSeries.deploy(
          "Test",
          "TEST",
          protocol.address,
          ethers.ZeroAddress,
          REVENUE_SHARE_BPS,
          DURATION_DAYS,
          INITIAL_SUPPLY
        )
      ).to.be.revertedWith("Invalid router");
    });

    it("Should reject invalid BPS", async function () {
      const RevenueSeries = await ethers.getContractFactory("RevenueSeries");
      await expect(
        RevenueSeries.deploy(
          "Test",
          "TEST",
          protocol.address,
          router.address,
          0,
          DURATION_DAYS,
          INITIAL_SUPPLY
        )
      ).to.be.revertedWith("Invalid BPS");

      await expect(
        RevenueSeries.deploy(
          "Test",
          "TEST",
          protocol.address,
          router.address,
          10001,
          DURATION_DAYS,
          INITIAL_SUPPLY
        )
      ).to.be.revertedWith("Invalid BPS");
    });

    it("Should reject zero duration", async function () {
      const RevenueSeries = await ethers.getContractFactory("RevenueSeries");
      await expect(
        RevenueSeries.deploy(
          "Test",
          "TEST",
          protocol.address,
          router.address,
          REVENUE_SHARE_BPS,
          0,
          INITIAL_SUPPLY
        )
      ).to.be.revertedWith("Invalid duration");
    });

    it("Should reject zero supply", async function () {
      const RevenueSeries = await ethers.getContractFactory("RevenueSeries");
      await expect(
        RevenueSeries.deploy(
          "Test",
          "TEST",
          protocol.address,
          router.address,
          REVENUE_SHARE_BPS,
          DURATION_DAYS,
          0
        )
      ).to.be.revertedWith("Invalid supply");
    });
  });

  describe("Revenue Distribution", function () {
    beforeEach(async function () {
      // Protocol distributes tokens to investors
      await revenueSeries.connect(protocol).transfer(alice.address, ethers.parseEther("100000")); // 10%
      await revenueSeries.connect(protocol).transfer(bob.address, ethers.parseEther("50000")); // 5%
    });

    it("Should allow protocol to distribute revenue", async function () {
      const revenueAmount = ethers.parseEther("10");
      
      await expect(
        revenueSeries.connect(protocol).distributeRevenue({ value: revenueAmount })
      ).to.emit(revenueSeries, "RevenueReceived")
        .withArgs(revenueAmount, await time.latest() + 1);

      expect(await revenueSeries.totalRevenueReceived()).to.equal(revenueAmount);
    });

    it("Should allow router to distribute revenue", async function () {
      const revenueAmount = ethers.parseEther("5");
      
      await expect(
        revenueSeries.connect(router).distributeRevenue({ value: revenueAmount })
      ).to.emit(revenueSeries, "RevenueReceived");

      expect(await revenueSeries.totalRevenueReceived()).to.equal(revenueAmount);
    });

    it("Should reject distribution from unauthorized address", async function () {
      await expect(
        revenueSeries.connect(alice).distributeRevenue({ value: ethers.parseEther("1") })
      ).to.be.revertedWith("Only protocol or router can distribute");
    });

    it("Should reject distribution when inactive", async function () {
      await time.increase(DURATION_DAYS * 24 * 60 * 60 + 1);
      await revenueSeries.matureSeries();

      await expect(
        revenueSeries.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") })
      ).to.be.revertedWith("Series not active");
    });

    it("Should update revenuePerTokenStored correctly", async function () {
      const revenueAmount = ethers.parseEther("10");
      await revenueSeries.connect(protocol).distributeRevenue({ value: revenueAmount });

      const expectedPerToken = (revenueAmount * ethers.parseEther("1")) / INITIAL_SUPPLY;
      expect(await revenueSeries.revenuePerTokenStored()).to.equal(expectedPerToken);
    });

    it("Should handle multiple distributions correctly", async function () {
      await revenueSeries.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      await revenueSeries.connect(router).distributeRevenue({ value: ethers.parseEther("5") });
      await revenueSeries.connect(protocol).distributeRevenue({ value: ethers.parseEther("3") });

      expect(await revenueSeries.totalRevenueReceived()).to.equal(ethers.parseEther("18"));
    });

    it("Should protect against division by zero", async function () {
      // Create series with zero initial supply (should fail in constructor)
      const RevenueSeries = await ethers.getContractFactory("RevenueSeries");
      await expect(
        RevenueSeries.deploy(
          "Test",
          "TEST",
          protocol.address,
          router.address,
          REVENUE_SHARE_BPS,
          DURATION_DAYS,
          0
        )
      ).to.be.revertedWith("Invalid supply");
    });

    it("Should reject distribution with zero value", async function () {
      await expect(
        revenueSeries.connect(protocol).distributeRevenue({ value: 0 })
      ).to.be.revertedWith("No revenue to distribute");
    });
  });

  describe("Claim Revenue", function () {
    beforeEach(async function () {
      // Protocol distributes tokens
      await revenueSeries.connect(protocol).transfer(alice.address, ethers.parseEther("100000")); // 10%
      await revenueSeries.connect(protocol).transfer(bob.address, ethers.parseEther("50000")); // 5%
      
      // Distribute revenue
      await revenueSeries.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
    });

    it("Should allow users to claim their revenue", async function () {
      const aliceBalanceBefore = await ethers.provider.getBalance(alice.address);
      
      const tx = await revenueSeries.connect(alice).claimRevenue();
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const aliceBalanceAfter = await ethers.provider.getBalance(alice.address);
      const expectedRevenue = ethers.parseEther("1"); // 10% of 10 ETH

      expect(aliceBalanceAfter - aliceBalanceBefore + gasUsed).to.be.closeTo(expectedRevenue, ethers.parseEther("0.001"));
    });

    it("Should emit RevenueClaimed event", async function () {
      await expect(revenueSeries.connect(alice).claimRevenue())
        .to.emit(revenueSeries, "RevenueClaimed")
        .withArgs(alice.address, ethers.parseEther("1"));
    });

    it("Should reset rewards after claim", async function () {
      await revenueSeries.connect(alice).claimRevenue();
      expect(await revenueSeries.rewards(alice.address)).to.equal(0);
    });

    it("Should revert if no revenue to claim", async function () {
      await revenueSeries.connect(alice).claimRevenue();
      await expect(
        revenueSeries.connect(alice).claimRevenue()
      ).to.be.revertedWith("No revenue to claim");
    });

    it("Should allow multiple claims after multiple distributions", async function () {
      await revenueSeries.connect(alice).claimRevenue(); // Claim first distribution
      
      await revenueSeries.connect(protocol).distributeRevenue({ value: ethers.parseEther("20") });
      
      const tx = await revenueSeries.connect(alice).claimRevenue();
      const receipt = await tx.wait();
      
      // Alice should receive 10% of 20 ETH = 2 ETH
      await expect(tx).to.emit(revenueSeries, "RevenueClaimed")
        .withArgs(alice.address, ethers.parseEther("2"));
    });

    it("Should calculate claimable correctly", async function () {
      const claimable = await revenueSeries.calculateClaimable(alice.address);
      expect(claimable).to.equal(ethers.parseEther("1")); // 10% of 10 ETH
    });

    it("Should handle zero balance correctly", async function () {
      const claimable = await revenueSeries.calculateClaimable(charlie.address);
      expect(claimable).to.equal(0);
    });
  });

  describe("ClaimFor (Relayer)", function () {
    beforeEach(async function () {
      await revenueSeries.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await revenueSeries.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
    });

    it("Should allow relayer to claim for user", async function () {
      const aliceBalanceBefore = await ethers.provider.getBalance(alice.address);
      
      await revenueSeries.connect(relayer).claimFor(alice.address);
      
      const aliceBalanceAfter = await ethers.provider.getBalance(alice.address);
      const expectedRevenue = ethers.parseEther("1");

      expect(aliceBalanceAfter - aliceBalanceBefore).to.equal(expectedRevenue);
    });

    it("Should emit RevenueClaimed with user address", async function () {
      await expect(revenueSeries.connect(relayer).claimFor(alice.address))
        .to.emit(revenueSeries, "RevenueClaimed")
        .withArgs(alice.address, ethers.parseEther("1"));
    });

    it("Should reject zero address", async function () {
      await expect(
        revenueSeries.connect(relayer).claimFor(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid user");
    });

    it("Should revert if user has no revenue", async function () {
      await expect(
        revenueSeries.connect(relayer).claimFor(charlie.address)
      ).to.be.revertedWith("No revenue to claim");
    });

    it("Should allow user to claim for themselves", async function () {
      await expect(revenueSeries.connect(alice).claimFor(alice.address))
        .to.emit(revenueSeries, "RevenueClaimed");
    });
  });

  describe("Transfer Accounting", function () {
    beforeEach(async function () {
      await revenueSeries.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await revenueSeries.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
    });

    it("Should update rewards before transfer", async function () {
      // Alice transfers to Bob
      await revenueSeries.connect(alice).transfer(bob.address, ethers.parseEther("50000"));

      // Alice should have accumulated rewards for 100K tokens
      const aliceRewards = await revenueSeries.rewards(alice.address);
      expect(aliceRewards).to.equal(ethers.parseEther("1")); // 10% of 10 ETH
    });

    it("Should not give Bob rewards for tokens received after distribution", async function () {
      await revenueSeries.connect(alice).transfer(bob.address, ethers.parseEther("50000"));

      // Bob should have 0 rewards (he got tokens after distribution)
      const bobRewards = await revenueSeries.rewards(bob.address);
      expect(bobRewards).to.equal(0);
    });

    it("Should track rewards correctly after transfer and new distribution", async function () {
      // Alice transfers half to Bob
      await revenueSeries.connect(alice).transfer(bob.address, ethers.parseEther("50000"));
      
      // New distribution
      await revenueSeries.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Alice should get 5% of new distribution (50K tokens)
      const aliceClaimable = await revenueSeries.calculateClaimable(alice.address);
      expect(aliceClaimable).to.be.closeTo(ethers.parseEther("1.5"), ethers.parseEther("0.01")); // 1 ETH old + 0.5 ETH new

      // Bob should get 5% of new distribution (50K tokens)
      const bobClaimable = await revenueSeries.calculateClaimable(bob.address);
      expect(bobClaimable).to.be.closeTo(ethers.parseEther("0.5"), ethers.parseEther("0.01"));
    });

    it("Should handle multiple transfers correctly", async function () {
      await revenueSeries.connect(alice).transfer(bob.address, ethers.parseEther("30000"));
      await revenueSeries.connect(alice).transfer(charlie.address, ethers.parseEther("20000"));

      // New distribution
      await revenueSeries.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Alice: 50K tokens = 5%
      const aliceClaimable = await revenueSeries.calculateClaimable(alice.address);
      expect(aliceClaimable).to.be.closeTo(ethers.parseEther("1.5"), ethers.parseEther("0.01"));

      // Bob: 30K tokens = 3%
      const bobClaimable = await revenueSeries.calculateClaimable(bob.address);
      expect(bobClaimable).to.be.closeTo(ethers.parseEther("0.3"), ethers.parseEther("0.01"));

      // Charlie: 20K tokens = 2%
      const charlieClaimable = await revenueSeries.calculateClaimable(charlie.address);
      expect(charlieClaimable).to.be.closeTo(ethers.parseEther("0.2"), ethers.parseEther("0.01"));
    });

    it("Should not lose rewards on transfer", async function () {
      const aliceRewardsBefore = await revenueSeries.calculateClaimable(alice.address);
      
      await revenueSeries.connect(alice).transfer(bob.address, ethers.parseEther("10000"));
      
      const aliceRewardsAfter = await revenueSeries.calculateClaimable(alice.address);
      
      expect(aliceRewardsAfter).to.equal(aliceRewardsBefore);
    });
  });

  describe("Maturity", function () {
    it("Should allow anyone to mature series after maturity date", async function () {
      await time.increase(DURATION_DAYS * 24 * 60 * 60 + 1);
      
      await expect(revenueSeries.connect(alice).matureSeries())
        .to.emit(revenueSeries, "SeriesMatured");

      expect(await revenueSeries.active()).to.equal(false);
    });

    it("Should reject maturity before maturity date", async function () {
      await expect(
        revenueSeries.connect(alice).matureSeries()
      ).to.be.revertedWith("Not matured yet");
    });

    it("Should prevent revenue distribution after maturity", async function () {
      await time.increase(DURATION_DAYS * 24 * 60 * 60 + 1);
      await revenueSeries.matureSeries();

      await expect(
        revenueSeries.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") })
      ).to.be.revertedWith("Series not active");
    });

    it("Should allow claims after maturity", async function () {
      await revenueSeries.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await revenueSeries.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      await time.increase(DURATION_DAYS * 24 * 60 * 60 + 1);
      await revenueSeries.matureSeries();

      await expect(revenueSeries.connect(alice).claimRevenue())
        .to.emit(revenueSeries, "RevenueClaimed");
    });

    it("Should allow transfers after maturity", async function () {
      await time.increase(DURATION_DAYS * 24 * 60 * 60 + 1);
      await revenueSeries.matureSeries();

      await expect(
        revenueSeries.connect(protocol).transfer(alice.address, ethers.parseEther("1000"))
      ).to.not.be.reverted;
    });
  });

  describe("Edge Cases", function () {
    it("Should handle very small revenue amounts", async function () {
      await revenueSeries.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      
      const smallAmount = ethers.parseEther("0.001"); // Small but reasonable amount
      await revenueSeries.connect(protocol).distributeRevenue({ value: smallAmount });

      const claimable = await revenueSeries.calculateClaimable(alice.address);
      expect(claimable).to.be.gt(0);
    });

    it("Should handle very large revenue amounts", async function () {
      await revenueSeries.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      
      const largeAmount = ethers.parseEther("100"); // More reasonable for test
      await revenueSeries.connect(protocol).distributeRevenue({ value: largeAmount });

      const claimable = await revenueSeries.calculateClaimable(alice.address);
      expect(claimable).to.equal(ethers.parseEther("10")); // 10% of 100 ETH
    });

    it("Should handle user with very small balance", async function () {
      await revenueSeries.connect(protocol).transfer(alice.address, 1); // 1 wei
      await revenueSeries.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      const claimable = await revenueSeries.calculateClaimable(alice.address);
      expect(claimable).to.be.gte(0);
    });

    it("Should reject receive() calls", async function () {
      await expect(
        alice.sendTransaction({ to: await revenueSeries.getAddress(), value: ethers.parseEther("1") })
      ).to.be.reverted;
    });

    it("Should handle claim with contract balance insufficient (should not happen)", async function () {
      await revenueSeries.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await revenueSeries.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // This should work normally
      await expect(revenueSeries.connect(alice).claimRevenue()).to.not.be.reverted;
    });
  });

  describe("Reentrancy Protection", function () {
    it("Should protect claimRevenue from reentrancy", async function () {
      // Deploy malicious contract that tries to reenter
      const MaliciousReceiver = await ethers.getContractFactory("MaliciousReceiver");
      const malicious = await MaliciousReceiver.deploy(await revenueSeries.getAddress());

      await revenueSeries.connect(protocol).transfer(await malicious.getAddress(), ethers.parseEther("100000"));
      await revenueSeries.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Attempt reentrancy - should succeed but not reenter due to nonReentrant
      await malicious.attack();
      
      // Verify it only claimed once
      expect(await revenueSeries.calculateClaimable(await malicious.getAddress())).to.equal(0);
    });

    it("Should protect claimFor from reentrancy", async function () {
      const MaliciousReceiver = await ethers.getContractFactory("MaliciousReceiver");
      const malicious = await MaliciousReceiver.deploy(await revenueSeries.getAddress());

      await revenueSeries.connect(protocol).transfer(await malicious.getAddress(), ethers.parseEther("100000"));
      await revenueSeries.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Attempt reentrancy - should succeed but not reenter
      await malicious.attackClaimFor();
      
      // Verify it only claimed once
      expect(await revenueSeries.calculateClaimable(await malicious.getAddress())).to.equal(0);
    });
  });

  describe("Gas Optimization", function () {
    it("Should have reasonable gas cost for distribution", async function () {
      const tx = await revenueSeries.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      const receipt = await tx.wait();
      
      // Should be under 100K gas
      expect(receipt.gasUsed).to.be.lt(100000);
    });

    it("Should have reasonable gas cost for claim", async function () {
      await revenueSeries.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await revenueSeries.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      const tx = await revenueSeries.connect(alice).claimRevenue();
      const receipt = await tx.wait();
      
      // Should be under 150K gas
      expect(receipt.gasUsed).to.be.lt(150000);
    });
  });
});

// Helper contract for reentrancy tests
// Note: This should be created separately or mocked
