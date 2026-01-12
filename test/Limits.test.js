const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Safety Limits - Mainnet Grade Tests", function () {
  let factory;
  let owner, treasury, protocol;
  
  const VALID_CONFIG = {
    name: "Test Series",
    symbol: "TEST",
    revenueShareBPS: 2000,
    durationDays: 365,
    totalSupply: ethers.parseEther("1000000")
  };

  beforeEach(async function () {
    [owner, treasury, protocol] = await ethers.getSigners();
    
    const RevenueSeriesFactory = await ethers.getContractFactory("RevenueSeriesFactory");
    factory = await RevenueSeriesFactory.deploy(treasury.address);
    await factory.waitForDeployment();
  });

  describe("1) Revenue Share BPS Limits", function () {
    it("Should revert if revenueShareBPS > MAX (5000)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          VALID_CONFIG.name,
          VALID_CONFIG.symbol,
          protocol.address,
          5001, // > 50%
          VALID_CONFIG.durationDays,
          VALID_CONFIG.totalSupply
        )
      ).to.be.revertedWith("Invalid BPS");
    });

    it("Should accept revenueShareBPS == MAX (5000)", async function () {
      const tx = await factory.connect(protocol).createSeries(
        VALID_CONFIG.name,
        VALID_CONFIG.symbol,
        protocol.address,
        5000, // Exactly 50%
        VALID_CONFIG.durationDays,
        VALID_CONFIG.totalSupply
      );
      
      await expect(tx).to.emit(factory, "SeriesCreated");
    });

    it("Should revert if revenueShareBPS == 0", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          VALID_CONFIG.name,
          VALID_CONFIG.symbol,
          protocol.address,
          0, // Zero not allowed
          VALID_CONFIG.durationDays,
          VALID_CONFIG.totalSupply
        )
      ).to.be.revertedWith("Invalid BPS");
    });

    it("Should accept revenueShareBPS == 1 (minimum)", async function () {
      const tx = await factory.connect(protocol).createSeries(
        VALID_CONFIG.name,
        VALID_CONFIG.symbol,
        protocol.address,
        1, // 0.01%
        VALID_CONFIG.durationDays,
        VALID_CONFIG.totalSupply
      );
      
      await expect(tx).to.emit(factory, "SeriesCreated");
    });

    it("Should accept common values (10%, 20%, 30%)", async function () {
      const commonShares = [1000, 2000, 3000]; // 10%, 20%, 30%
      
      for (let i = 0; i < commonShares.length; i++) {
        const tx = await factory.connect(protocol).createSeries(
          `Series ${i}`,
          `S${i}`,
          protocol.address,
          commonShares[i],
          VALID_CONFIG.durationDays,
          VALID_CONFIG.totalSupply
        );
        
        await expect(tx).to.emit(factory, "SeriesCreated");
      }
    });
  });

  describe("2) Duration Limits", function () {
    it("Should revert if duration < MIN (30 days)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          VALID_CONFIG.name,
          VALID_CONFIG.symbol,
          protocol.address,
          VALID_CONFIG.revenueShareBPS,
          29, // < 30 days
          VALID_CONFIG.totalSupply
        )
      ).to.be.revertedWith("Invalid duration");
    });

    it("Should accept duration == MIN (30 days)", async function () {
      const tx = await factory.connect(protocol).createSeries(
        VALID_CONFIG.name,
        VALID_CONFIG.symbol,
        protocol.address,
        VALID_CONFIG.revenueShareBPS,
        30, // Exactly 30 days
        VALID_CONFIG.totalSupply
      );
      
      await expect(tx).to.emit(factory, "SeriesCreated");
    });

    it("Should revert if duration > MAX (1825 days / 5 years)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          VALID_CONFIG.name,
          VALID_CONFIG.symbol,
          protocol.address,
          VALID_CONFIG.revenueShareBPS,
          1826, // > 1825 days
          VALID_CONFIG.totalSupply
        )
      ).to.be.revertedWith("Invalid duration");
    });

    it("Should accept duration == MAX (1825 days)", async function () {
      const tx = await factory.connect(protocol).createSeries(
        VALID_CONFIG.name,
        VALID_CONFIG.symbol,
        protocol.address,
        VALID_CONFIG.revenueShareBPS,
        1825, // Exactly 5 years
        VALID_CONFIG.totalSupply
      );
      
      await expect(tx).to.emit(factory, "SeriesCreated");
    });

    it("Should accept common durations (90d, 180d, 365d, 730d)", async function () {
      const commonDurations = [90, 180, 365, 730]; // 3m, 6m, 1y, 2y
      
      for (let i = 0; i < commonDurations.length; i++) {
        const tx = await factory.connect(protocol).createSeries(
          `Series ${i}`,
          `S${i}`,
          protocol.address,
          VALID_CONFIG.revenueShareBPS,
          commonDurations[i],
          VALID_CONFIG.totalSupply
        );
        
        await expect(tx).to.emit(factory, "SeriesCreated");
      }
    });
  });

  describe("3) Total Supply Limits", function () {
    it("Should revert if supply < MIN (1000 tokens)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          VALID_CONFIG.name,
          VALID_CONFIG.symbol,
          protocol.address,
          VALID_CONFIG.revenueShareBPS,
          VALID_CONFIG.durationDays,
          ethers.parseEther("999") // < 1000
        )
      ).to.be.revertedWith("Supply too low");
    });

    it("Should accept supply == MIN (1000 tokens)", async function () {
      const tx = await factory.connect(protocol).createSeries(
        VALID_CONFIG.name,
        VALID_CONFIG.symbol,
        protocol.address,
        VALID_CONFIG.revenueShareBPS,
        VALID_CONFIG.durationDays,
        ethers.parseEther("1000") // Exactly 1000
      );
      
      await expect(tx).to.emit(factory, "SeriesCreated");
    });

    it("Should accept large supplies (1M, 10M, 100M)", async function () {
      const largeSupplies = [
        ethers.parseEther("1000000"),
        ethers.parseEther("10000000"),
        ethers.parseEther("100000000")
      ];
      
      for (let i = 0; i < largeSupplies.length; i++) {
        const tx = await factory.connect(protocol).createSeries(
          `Series ${i}`,
          `S${i}`,
          protocol.address,
          VALID_CONFIG.revenueShareBPS,
          VALID_CONFIG.durationDays,
          largeSupplies[i]
        );
        
        await expect(tx).to.emit(factory, "SeriesCreated");
      }
    });

    it("Should handle supply with odd decimals", async function () {
      const tx = await factory.connect(protocol).createSeries(
        VALID_CONFIG.name,
        VALID_CONFIG.symbol,
        protocol.address,
        VALID_CONFIG.revenueShareBPS,
        VALID_CONFIG.durationDays,
        ethers.parseEther("1234.56789") // Odd decimals
      );
      
      await expect(tx).to.emit(factory, "SeriesCreated");
    });
  });

  describe("4) Combined Limits (Edge Cases)", function () {
    it("Should accept all parameters at minimum valid values", async function () {
      const tx = await factory.connect(protocol).createSeries(
        VALID_CONFIG.name,
        VALID_CONFIG.symbol,
        protocol.address,
        1, // Min BPS
        30, // Min duration
        ethers.parseEther("1000") // Min supply
      );
      
      await expect(tx).to.emit(factory, "SeriesCreated");
    });

    it("Should accept all parameters at maximum valid values", async function () {
      const tx = await factory.connect(protocol).createSeries(
        VALID_CONFIG.name,
        VALID_CONFIG.symbol,
        protocol.address,
        5000, // Max BPS
        1825, // Max duration
        ethers.parseEther("1000000000") // Large supply
      );
      
      await expect(tx).to.emit(factory, "SeriesCreated");
    });

    it("Should revert with multiple invalid parameters", async function () {
      // All parameters invalid
      await expect(
        factory.connect(protocol).createSeries(
          VALID_CONFIG.name,
          VALID_CONFIG.symbol,
          protocol.address,
          10000, // > MAX
          10, // < MIN
          ethers.parseEther("100") // < MIN
        )
      ).to.be.reverted; // Will fail on first check (BPS)
    });
  });

  describe("5) Limits Query", function () {
    it("Should return correct safety limits", async function () {
      const limits = await factory.getSafetyLimits();
      
      expect(limits[0]).to.equal(5000); // MAX_REVENUE_SHARE_BPS
      expect(limits[1]).to.equal(30); // MIN_DURATION_DAYS
      expect(limits[2]).to.equal(1825); // MAX_DURATION_DAYS
      expect(limits[3]).to.equal(ethers.parseEther("1000")); // MIN_TOTAL_SUPPLY
    });

    it("Limits should be immutable (constant)", async function () {
      const limitsBefore = await factory.getSafetyLimits();
      
      // Create some series
      await factory.connect(protocol).createSeries(
        VALID_CONFIG.name,
        VALID_CONFIG.symbol,
        protocol.address,
        VALID_CONFIG.revenueShareBPS,
        VALID_CONFIG.durationDays,
        VALID_CONFIG.totalSupply
      );
      
      const limitsAfter = await factory.getSafetyLimits();
      
      // Limits unchanged
      expect(limitsAfter[0]).to.equal(limitsBefore[0]);
      expect(limitsAfter[1]).to.equal(limitsBefore[1]);
      expect(limitsAfter[2]).to.equal(limitsBefore[2]);
      expect(limitsAfter[3]).to.equal(limitsBefore[3]);
    });
  });

  describe("6) Protection Against Common Mistakes", function () {
    it("Should prevent 100% revenue share", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          VALID_CONFIG.name,
          VALID_CONFIG.symbol,
          protocol.address,
          10000, // 100%
          VALID_CONFIG.durationDays,
          VALID_CONFIG.totalSupply
        )
      ).to.be.revertedWith("Invalid BPS");
    });

    it("Should prevent very short duration (1 day)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          VALID_CONFIG.name,
          VALID_CONFIG.symbol,
          protocol.address,
          VALID_CONFIG.revenueShareBPS,
          1, // 1 day
          VALID_CONFIG.totalSupply
        )
      ).to.be.revertedWith("Invalid duration");
    });

    it("Should prevent dust supply (1 wei)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          VALID_CONFIG.name,
          VALID_CONFIG.symbol,
          protocol.address,
          VALID_CONFIG.revenueShareBPS,
          VALID_CONFIG.durationDays,
          1 // 1 wei
        )
      ).to.be.revertedWith("Supply too low");
    });

    it("Should prevent unrealistic long duration (100 years)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          VALID_CONFIG.name,
          VALID_CONFIG.symbol,
          protocol.address,
          VALID_CONFIG.revenueShareBPS,
          36500, // 100 years
          VALID_CONFIG.totalSupply
        )
      ).to.be.revertedWith("Invalid duration");
    });
  });
});
