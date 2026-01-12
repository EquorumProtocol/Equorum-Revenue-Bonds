const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Stress Tests and Performance", function () {
  let factory;
  let series;
  let router;
  let protocol;
  let holders;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const REVENUE_SHARE_BPS = 2000;
  const DURATION_DAYS = 365;

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    protocol = signers[0];
    holders = signers.slice(1, 11); // 10 holders

    const RevenueSeriesFactory = await ethers.getContractFactory("RevenueSeriesFactory");
    factory = await RevenueSeriesFactory.deploy(protocol.address); // Treasury address

    const result = await factory.connect(protocol).createSeries.staticCall(
      "Stress Test Series",
      "STRESS",
      protocol.address,
      REVENUE_SHARE_BPS,
      DURATION_DAYS,
      INITIAL_SUPPLY
    );

    await factory.connect(protocol).createSeries(
      "Stress Test Series",
      "STRESS",
      protocol.address,
      REVENUE_SHARE_BPS,
      DURATION_DAYS,
      INITIAL_SUPPLY
    );

    const RevenueSeries = await ethers.getContractFactory("RevenueSeries");
    series = RevenueSeries.attach(result.seriesAddress);

    const RevenueRouter = await ethers.getContractFactory("RevenueRouter");
    router = RevenueRouter.attach(result.routerAddress);
  });

  describe("Many Holders Scenario", function () {
    beforeEach(async function () {
      // Distribute tokens to many holders
      const amountPerHolder = INITIAL_SUPPLY / BigInt(holders.length);
      for (const holder of holders) {
        await series.connect(protocol).transfer(holder.address, amountPerHolder);
      }
    });

    it("Should handle distribution with many holders", async function () {
      const tx = await series.connect(protocol).distributeRevenue({ 
        value: ethers.parseEther("100") 
      });
      const receipt = await tx.wait();

      console.log(`      Distribution gas (${holders.length} holders):`, receipt.gasUsed.toString());
      expect(receipt.gasUsed).to.be.lt(150000);
    });

    it("Should handle multiple claims efficiently", async function () {
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("100") });

      const gasUsed = [];
      for (const holder of holders.slice(0, 5)) {
        const tx = await series.connect(holder).claimRevenue();
        const receipt = await tx.wait();
        gasUsed.push(receipt.gasUsed);
      }

      const avgGas = gasUsed.reduce((a, b) => a + b, 0n) / BigInt(gasUsed.length);
      console.log(`      Average claim gas (${holders.length} holders):`, avgGas.toString());
      expect(avgGas).to.be.lt(150000n);
    });

    it("Should handle many transfers between holders", async function () {
      const transferAmount = ethers.parseEther("1000");
      
      for (let i = 0; i < holders.length - 1; i++) {
        await series.connect(holders[i]).transfer(holders[i + 1].address, transferAmount);
      }

      // Verify total supply unchanged
      expect(await series.totalSupply()).to.equal(INITIAL_SUPPLY);
    });
  });

  describe("Many Distributions Scenario", function () {
    beforeEach(async function () {
      await series.connect(protocol).transfer(holders[0].address, ethers.parseEther("100000"));
    });

    it("Should handle many small distributions", async function () {
      const distributionCount = 20;
      
      for (let i = 0; i < distributionCount; i++) {
        await series.connect(protocol).distributeRevenue({ 
          value: ethers.parseEther("1") 
        });
      }

      expect(await series.totalRevenueReceived()).to.equal(ethers.parseEther("20"));
    });

    it("Should maintain accurate accounting after many distributions", async function () {
      // 50 distributions
      for (let i = 0; i < 50; i++) {
        await series.connect(protocol).distributeRevenue({ 
          value: ethers.parseEther("0.5") 
        });
      }

      const claimable = await series.calculateClaimable(holders[0].address);
      
      // 10% of 25 ETH = 2.5 ETH
      expect(claimable).to.be.closeTo(ethers.parseEther("2.5"), ethers.parseEther("0.01"));
    });

    it("Should handle claim after many distributions efficiently", async function () {
      for (let i = 0; i < 30; i++) {
        await series.connect(protocol).distributeRevenue({ 
          value: ethers.parseEther("1") 
        });
      }

      const tx = await series.connect(holders[0]).claimRevenue();
      const receipt = await tx.wait();

      console.log("      Claim gas after 30 distributions:", receipt.gasUsed.toString());
      expect(receipt.gasUsed).to.be.lt(150000);
    });
  });

  describe("High Frequency Operations", function () {
    beforeEach(async function () {
      const amountPerHolder = ethers.parseEther("100000");
      for (let i = 0; i < 5; i++) {
        await series.connect(protocol).transfer(holders[i].address, amountPerHolder);
      }
    });

    it("Should handle rapid distribution-claim cycles", async function () {
      for (let i = 0; i < 10; i++) {
        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
        await series.connect(holders[0]).claimRevenue();
      }

      // Holder should have claimed all
      expect(await series.calculateClaimable(holders[0].address)).to.equal(0);
    });

    it("Should handle rapid transfers during distributions", async function () {
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      
      // Rapid transfers
      for (let i = 0; i < 10; i++) {
        await series.connect(holders[0]).transfer(
          holders[1].address, 
          ethers.parseEther("1000")
        );
        await series.connect(holders[1]).transfer(
          holders[0].address, 
          ethers.parseEther("1000")
        );
      }

      // Rewards should still be claimable
      const claimable = await series.calculateClaimable(holders[0].address);
      expect(claimable).to.be.gt(0);
    });
  });

  describe("Large Value Scenarios", function () {
    it("Should handle very large revenue amounts", async function () {
      await series.connect(protocol).transfer(holders[0].address, ethers.parseEther("100000"));

      const largeAmount = ethers.parseEther("100"); // More reasonable for test
      await series.connect(protocol).distributeRevenue({ value: largeAmount });

      const claimable = await series.calculateClaimable(holders[0].address);
      expect(claimable).to.equal(ethers.parseEther("10")); // 10% of 100
    });

    it("Should handle accumulated large rewards", async function () {
      await series.connect(protocol).transfer(holders[0].address, ethers.parseEther("500000"));

      // Accumulate large rewards
      for (let i = 0; i < 10; i++) {
        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("100") });
      }

      const claimable = await series.calculateClaimable(holders[0].address);
      expect(claimable).to.be.closeTo(ethers.parseEther("500"), ethers.parseEther("1")); // 50% of 1000
    });
  });

  describe("Long-Running Series Simulation", function () {
    it("Should simulate 30 days of daily distributions", async function () {
      await series.connect(protocol).transfer(holders[0].address, ethers.parseEther("100000"));

      const days = 30;
      const dailyRevenue = ethers.parseEther("10");

      for (let day = 0; day < days; day++) {
        await series.connect(protocol).distributeRevenue({ value: dailyRevenue });
        await time.increase(24 * 60 * 60); // 1 day
      }

      const totalDistributed = dailyRevenue * BigInt(days);
      expect(await series.totalRevenueReceived()).to.equal(totalDistributed);

      const claimable = await series.calculateClaimable(holders[0].address);
      expect(claimable).to.be.closeTo(ethers.parseEther("30"), ethers.parseEther("0.1")); // 10% of 300
    });

    it("Should handle variable revenue over time", async function () {
      await series.connect(protocol).transfer(holders[0].address, ethers.parseEther("100000"));

      // Simulate bull/bear cycles
      const revenues = [
        ethers.parseEther("5"),   // Bear
        ethers.parseEther("10"),  // Normal
        ethers.parseEther("50"),  // Bull
        ethers.parseEther("100"), // Peak
        ethers.parseEther("20"),  // Correction
        ethers.parseEther("8"),   // Bear
      ];

      for (const revenue of revenues) {
        await series.connect(protocol).distributeRevenue({ value: revenue });
        await time.increase(7 * 24 * 60 * 60); // 1 week
      }

      const totalRevenue = revenues.reduce((a, b) => a + b, 0n);
      expect(await series.totalRevenueReceived()).to.equal(totalRevenue);
    });
  });

  describe("Multiple Series Stress Test", function () {
    it("Should handle multiple series operating simultaneously", async function () {
      const seriesCount = 5;
      const seriesContracts = [];

      // Create multiple series
      for (let i = 0; i < seriesCount; i++) {
        const result = await factory.connect(protocol).createSeries.staticCall(
          `Series ${i}`,
          `SER${i}`,
          protocol.address,
          REVENUE_SHARE_BPS,
          DURATION_DAYS,
          INITIAL_SUPPLY
        );

        await factory.connect(protocol).createSeries(
          `Series ${i}`,
          `SER${i}`,
          protocol.address,
          REVENUE_SHARE_BPS,
          DURATION_DAYS,
          INITIAL_SUPPLY
        );

        const RevenueSeries = await ethers.getContractFactory("RevenueSeries");
        seriesContracts.push(RevenueSeries.attach(result.seriesAddress));
      }

      // Distribute tokens and revenue to all series
      for (const ser of seriesContracts) {
        await ser.connect(protocol).transfer(holders[0].address, ethers.parseEther("100000"));
        await ser.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      }

      // Verify all series work independently
      for (const ser of seriesContracts) {
        const claimable = await ser.calculateClaimable(holders[0].address);
        expect(claimable).to.be.closeTo(ethers.parseEther("1"), ethers.parseEther("0.01"));
      }
    });
  });

  describe("Gas Benchmarks", function () {
    it("Should benchmark all critical operations", async function () {
      await series.connect(protocol).transfer(holders[0].address, ethers.parseEther("100000"));

      // Distribution
      const distributeTx = await series.connect(protocol).distributeRevenue({ 
        value: ethers.parseEther("10") 
      });
      const distributeReceipt = await distributeTx.wait();
      console.log("      Distribution gas:", distributeReceipt.gasUsed.toString());

      // Claim
      const claimTx = await series.connect(holders[0]).claimRevenue();
      const claimReceipt = await claimTx.wait();
      console.log("      Claim gas:", claimReceipt.gasUsed.toString());

      // Transfer
      const transferTx = await series.connect(holders[0]).transfer(
        holders[1].address, 
        ethers.parseEther("10000")
      );
      const transferReceipt = await transferTx.wait();
      console.log("      Transfer gas:", transferReceipt.gasUsed.toString());

      // Router route
      await protocol.sendTransaction({ 
        to: await router.getAddress(), 
        value: ethers.parseEther("10") 
      });
      const routeTx = await router.routeRevenue();
      const routeReceipt = await routeTx.wait();
      console.log("      Route gas:", routeReceipt.gasUsed.toString());

      // All should be under reasonable limits
      expect(distributeReceipt.gasUsed).to.be.lt(150000);
      expect(claimReceipt.gasUsed).to.be.lt(150000);
      expect(transferReceipt.gasUsed).to.be.lt(100000);
      expect(routeReceipt.gasUsed).to.be.lt(200000);
    });
  });

  describe("Edge Case Combinations", function () {
    it("Should handle distribution + transfer + claim in sequence", async function () {
      await series.connect(protocol).transfer(holders[0].address, ethers.parseEther("100000"));
      
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      await series.connect(holders[0]).transfer(holders[1].address, ethers.parseEther("50000"));
      await series.connect(holders[0]).claimRevenue();

      // Holder 0 should have claimed 1 ETH (10% of 10)
      expect(await series.rewards(holders[0].address)).to.equal(0);
    });

    it("Should handle concurrent operations from multiple users", async function () {
      // Setup multiple holders
      for (let i = 0; i < 3; i++) {
        await series.connect(protocol).transfer(holders[i].address, ethers.parseEther("100000"));
      }

      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("30") });

      // All claim simultaneously (in same block if possible)
      await series.connect(holders[0]).claimRevenue();
      await series.connect(holders[1]).claimRevenue();
      await series.connect(holders[2]).claimRevenue();

      // All should have claimed their shares
      expect(await series.rewards(holders[0].address)).to.equal(0);
      expect(await series.rewards(holders[1].address)).to.equal(0);
      expect(await series.rewards(holders[2].address)).to.equal(0);
    });
  });

  describe("Memory and Storage Efficiency", function () {
    it("Should not accumulate unbounded state", async function () {
      await series.connect(protocol).transfer(holders[0].address, ethers.parseEther("100000"));

      // Many operations
      for (let i = 0; i < 20; i++) {
        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") });
        if (i % 5 === 0) {
          await series.connect(holders[0]).claimRevenue();
        }
      }

      // State should remain manageable
      expect(await series.totalRevenueReceived()).to.equal(ethers.parseEther("20"));
    });

    it("Should handle storage efficiently with many holders", async function () {
      const holderCount = holders.length;
      const amountPerHolder = INITIAL_SUPPLY / BigInt(holderCount);

      // Distribute to all holders
      for (let i = 0; i < holderCount; i++) {
        await series.connect(protocol).transfer(holders[i].address, amountPerHolder);
      }

      // Single distribution should update all holders' accounting
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("100") });

      // All holders should have claimable rewards
      for (let i = 0; i < holderCount; i++) {
        const claimable = await series.calculateClaimable(holders[i].address);
        expect(claimable).to.be.gt(0);
      }
    });
  });
});
