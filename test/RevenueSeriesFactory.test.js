const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployFullStack, createSeriesViaFactory, DEFAULT_PARAMS } = require("./helpers");

describe("RevenueSeriesFactory", function () {
  let owner, treasury, protocol, rest, registry, factory;

  beforeEach(async function () {
    ({ owner, treasury, protocol, rest, registry, factory } = await deployFullStack());
  });

  // ============================================
  // DEPLOYMENT
  // ============================================
  describe("Deployment", function () {
    it("Should set correct treasury", async function () {
      expect(await factory.treasury()).to.equal(treasury.address);
    });

    it("Should set correct reputation registry", async function () {
      expect(await factory.reputationRegistry()).to.equal(await registry.getAddress());
    });

    it("Should set owner to deployer", async function () {
      expect(await factory.owner()).to.equal(owner.address);
    });

    it("Should start with all policies as address(0)", async function () {
      const policies = await factory.getPolicies();
      expect(policies.fee).to.equal(ethers.ZeroAddress);
      expect(policies.safety).to.equal(ethers.ZeroAddress);
      expect(policies.access).to.equal(ethers.ZeroAddress);
    });

    it("Should have correct hardcoded safety limits", async function () {
      const limits = await factory.getSafetyLimits();
      expect(limits.maxShareBPS).to.equal(5000);
      expect(limits.minDurationDays).to.equal(30);
      expect(limits.maxDurationDays).to.equal(1825);
      expect(limits.minSupply).to.equal(ethers.parseEther("1000"));
    });

    it("Should start with zero series", async function () {
      expect(await factory.getTotalSeries()).to.equal(0);
    });

    it("Should revert if treasury is zero address", async function () {
      const Factory = await ethers.getContractFactory("contracts/v2/core/RevenueSeriesFactory.sol:RevenueSeriesFactory");
      await expect(
        Factory.deploy(ethers.ZeroAddress, await registry.getAddress())
      ).to.be.revertedWith("Invalid treasury");
    });

    it("Should revert if registry is zero address", async function () {
      const Factory = await ethers.getContractFactory("contracts/v2/core/RevenueSeriesFactory.sol:RevenueSeriesFactory");
      await expect(
        Factory.deploy(treasury.address, ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid registry");
    });
  });

  // ============================================
  // CREATE SERIES
  // ============================================
  describe("Create Series", function () {
    it("Should create series successfully", async function () {
      const { series, router } = await createSeriesViaFactory(factory, protocol);
      expect(await series.getAddress()).to.be.properAddress;
      expect(await router.getAddress()).to.be.properAddress;
    });

    it("Should emit SeriesCreated event", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.emit(factory, "SeriesCreated");
    });

    it("Should increment total series count", async function () {
      await createSeriesViaFactory(factory, protocol);
      expect(await factory.getTotalSeries()).to.equal(1);
    });

    it("Should register series in allSeries array", async function () {
      const { seriesAddress } = await createSeriesViaFactory(factory, protocol);
      const all = await factory.getAllSeries();
      expect(all.length).to.equal(1);
      expect(all[0]).to.equal(seriesAddress);
    });

    it("Should register series in seriesByProtocol mapping", async function () {
      const { seriesAddress } = await createSeriesViaFactory(factory, protocol);
      const protocolSeries = await factory.getSeriesByProtocol(protocol.address);
      expect(protocolSeries.length).to.equal(1);
      expect(protocolSeries[0]).to.equal(seriesAddress);
    });

    it("Should register router in routerBySeries mapping", async function () {
      const { seriesAddress, routerAddress } = await createSeriesViaFactory(factory, protocol);
      expect(await factory.getRouterForSeries(seriesAddress)).to.equal(routerAddress);
    });

    it("Should transfer series ownership to protocol", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      expect(await series.owner()).to.equal(protocol.address);
    });

    it("Should transfer router ownership to protocol", async function () {
      const { router } = await createSeriesViaFactory(factory, protocol);
      expect(await router.owner()).to.equal(protocol.address);
    });

    it("Should mint all tokens to protocol", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      expect(await series.balanceOf(protocol.address)).to.equal(DEFAULT_PARAMS.totalSupply);
    });

    it("Should set correct series parameters", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      expect(await series.revenueShareBPS()).to.equal(DEFAULT_PARAMS.revenueShareBPS);
      expect(await series.totalTokenSupply()).to.equal(DEFAULT_PARAMS.totalSupply);
      expect(await series.minDistributionAmount()).to.equal(DEFAULT_PARAMS.minDistributionAmount);
      expect(await series.active()).to.be.true;
    });

    it("Should link router and series correctly", async function () {
      const { series, router, seriesAddress, routerAddress } = await createSeriesViaFactory(factory, protocol);
      expect(await series.router()).to.equal(routerAddress);
      expect(await router.revenueSeries()).to.equal(seriesAddress);
    });
  });

  // ============================================
  // ACCESS CONTROL
  // ============================================
  describe("Access Control", function () {
    it("Should allow protocol to create series for itself", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.not.be.reverted;
    });

    it("Should reject if msg.sender != protocol argument", async function () {
      const [, , , alice] = await ethers.getSigners();
      await expect(
        factory.connect(alice).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.be.revertedWith("Only protocol can create series for itself");
    });

    it("Should reject creating series for another address", async function () {
      const [, , , alice] = await ethers.getSigners();
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, alice.address,
          DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.be.revertedWith("Only protocol can create series for itself");
    });

    it("Should reject zero protocol address", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, ethers.ZeroAddress,
          DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.be.revertedWith("Invalid protocol");
    });
  });

  // ============================================
  // VALIDATION (Hardcoded Safety Limits)
  // ============================================
  describe("Validation", function () {
    it("Should reject BPS = 0", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          0, DEFAULT_PARAMS.durationDays,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.be.revertedWith("Invalid BPS");
    });

    it("Should reject BPS > 5000 (50%)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          5001, DEFAULT_PARAMS.durationDays,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.be.revertedWith("Invalid BPS");
    });

    it("Should accept BPS = 1 (minimum)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          1, DEFAULT_PARAMS.durationDays,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.not.be.reverted;
    });

    it("Should accept BPS = 5000 (maximum)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "Max BPS", "MAXBPS", protocol.address,
          5000, DEFAULT_PARAMS.durationDays,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.not.be.reverted;
    });

    it("Should reject duration < 30 days", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, 29,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.be.revertedWith("Invalid duration");
    });

    it("Should reject duration > 1825 days (5 years)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, 1826,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.be.revertedWith("Invalid duration");
    });

    it("Should accept duration = 30 (minimum)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, 30,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.not.be.reverted;
    });

    it("Should accept duration = 1825 (maximum)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "Long", "LONG", protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, 1825,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.not.be.reverted;
    });

    it("Should reject supply < 1000 tokens", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
          ethers.parseEther("999"), DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.be.revertedWith("Supply too low");
    });

    it("Should accept supply = 1000 tokens (minimum)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
          ethers.parseEther("1000"), DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.not.be.reverted;
    });

    it("Should reject minDistributionAmount < 0.001 ether", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
          DEFAULT_PARAMS.totalSupply, ethers.parseEther("0.0009")
        )
      ).to.be.revertedWith("Min distribution too low");
    });

    it("Should accept minDistributionAmount = 0.001 ether (minimum)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
          DEFAULT_PARAMS.totalSupply, ethers.parseEther("0.001")
        )
      ).to.not.be.reverted;
    });
  });

  // ============================================
  // MULTIPLE SERIES
  // ============================================
  describe("Multiple Series", function () {
    it("Should allow protocol to create multiple series", async function () {
      await createSeriesViaFactory(factory, protocol, { name: "Series 1", symbol: "S1" });
      await createSeriesViaFactory(factory, protocol, { name: "Series 2", symbol: "S2" });
      expect(await factory.getTotalSeries()).to.equal(2);
    });

    it("Should track series from different protocols separately", async function () {
      const otherProtocol = rest[0];
      await createSeriesViaFactory(factory, protocol, { name: "P1 Series", symbol: "P1S" });
      await createSeriesViaFactory(factory, otherProtocol, { name: "P2 Series", symbol: "P2S" });

      const p1Series = await factory.getSeriesByProtocol(protocol.address);
      const p2Series = await factory.getSeriesByProtocol(otherProtocol.address);
      expect(p1Series.length).to.equal(1);
      expect(p2Series.length).to.equal(1);
      expect(await factory.getTotalSeries()).to.equal(2);
    });

    it("Should create independent series with different parameters", async function () {
      const { series: s1 } = await createSeriesViaFactory(factory, protocol, {
        name: "S1", symbol: "S1", revenueShareBPS: 2000, totalSupply: ethers.parseEther("1000000"),
      });
      const { series: s2 } = await createSeriesViaFactory(factory, protocol, {
        name: "S2", symbol: "S2", revenueShareBPS: 5000, totalSupply: ethers.parseEther("500000"),
      });

      expect(await s1.revenueShareBPS()).to.equal(2000);
      expect(await s2.revenueShareBPS()).to.equal(5000);
      expect(await s1.totalTokenSupply()).to.equal(ethers.parseEther("1000000"));
      expect(await s2.totalTokenSupply()).to.equal(ethers.parseEther("500000"));
    });
  });

  // ============================================
  // VIEW FUNCTIONS
  // ============================================
  describe("View Functions", function () {
    it("Should return correct total series count", async function () {
      await createSeriesViaFactory(factory, protocol);
      expect(await factory.getTotalSeries()).to.equal(1);
    });

    it("Should return series by protocol", async function () {
      await createSeriesViaFactory(factory, protocol);
      const series = await factory.getSeriesByProtocol(protocol.address);
      expect(series.length).to.equal(1);
    });

    it("Should return empty array for protocol with no series", async function () {
      const series = await factory.getSeriesByProtocol(rest[0].address);
      expect(series.length).to.equal(0);
    });

    it("Should return zero address for non-existent series router", async function () {
      expect(await factory.getRouterForSeries(rest[0].address)).to.equal(ethers.ZeroAddress);
    });
  });

  // ============================================
  // ADMIN FUNCTIONS
  // ============================================
  describe("Admin Functions", function () {
    it("Should allow owner to update treasury", async function () {
      const newTreasury = rest[0].address;
      await expect(factory.setTreasury(newTreasury))
        .to.emit(factory, "TreasuryUpdated")
        .withArgs(treasury.address, newTreasury);
      expect(await factory.treasury()).to.equal(newTreasury);
    });

    it("Should reject zero address treasury", async function () {
      await expect(factory.setTreasury(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid treasury");
    });

    it("Should reject non-owner setting treasury", async function () {
      await expect(factory.connect(protocol).setTreasury(rest[0].address))
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("Should allow owner to update reputation registry", async function () {
      const newRegistry = rest[0].address;
      await expect(factory.updateReputationRegistry(newRegistry))
        .to.emit(factory, "ReputationRegistryUpdated");
      expect(await factory.reputationRegistry()).to.equal(newRegistry);
    });

    it("Should reject zero address registry", async function () {
      await expect(factory.updateReputationRegistry(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid registry");
    });
  });

  // ============================================
  // PAUSABLE
  // ============================================
  describe("Pausable", function () {
    it("Should allow owner to pause", async function () {
      await factory.pause();
      expect(await factory.paused()).to.be.true;
    });

    it("Should reject createSeries when paused", async function () {
      await factory.pause();
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.be.revertedWithCustomError(factory, "EnforcedPause");
    });

    it("Should allow createSeries after unpause", async function () {
      await factory.pause();
      await factory.unpause();
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.not.be.reverted;
    });

    it("Should reject non-owner pause", async function () {
      await expect(factory.connect(protocol).pause())
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================
  describe("Edge Cases", function () {
    it("Should handle very long names and symbols", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "A".repeat(100), "B".repeat(50), protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.not.be.reverted;
    });

    it("Should handle very large supply (1 billion)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
          ethers.parseEther("1000000000"), DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.not.be.reverted;
    });

    it("Should have reasonable gas cost for series creation", async function () {
      const tx = await factory.connect(protocol).createSeries(
        DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
        DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
        DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
      );
      const receipt = await tx.wait();
      expect(receipt.gasUsed).to.be.lt(5000000);
    });
  });
});
