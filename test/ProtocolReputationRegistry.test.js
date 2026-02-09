const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFullStack, createSeriesViaFactory, DEFAULT_PARAMS, REGISTRY_PATH } = require("./helpers");

describe("ProtocolReputationRegistry", function () {
  let owner, treasury, protocol, rest, registry, factory;
  let alice;

  beforeEach(async function () {
    ({ owner, treasury, protocol, rest, registry, factory } = await deployFullStack());
    [alice] = rest;
  });

  // ============================================
  // DEPLOYMENT
  // ============================================
  describe("Deployment", function () {
    it("Should set owner to deployer", async function () {
      expect(await registry.owner()).to.equal(owner.address);
    });
  });

  // ============================================
  // AUTHORIZE REPORTER
  // ============================================
  describe("authorizeReporter", function () {
    it("Should allow owner to authorize reporter", async function () {
      await expect(registry.authorizeReporter(alice.address))
        .to.emit(registry, "ReporterAuthorized")
        .withArgs(alice.address);
      expect(await registry.authorizedReporters(alice.address)).to.be.true;
    });

    it("Should reject zero address", async function () {
      await expect(registry.authorizeReporter(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid reporter");
    });

    it("Should reject non-owner", async function () {
      await expect(registry.connect(alice).authorizeReporter(alice.address))
        .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });

  // ============================================
  // REVOKE REPORTER
  // ============================================
  describe("revokeReporter", function () {
    it("Should allow owner to revoke reporter", async function () {
      await registry.authorizeReporter(alice.address);
      await expect(registry.revokeReporter(alice.address))
        .to.emit(registry, "ReporterRevoked")
        .withArgs(alice.address);
      expect(await registry.authorizedReporters(alice.address)).to.be.false;
    });

    it("Should reject non-owner", async function () {
      await expect(registry.connect(alice).revokeReporter(alice.address))
        .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });

  // ============================================
  // REGISTER SERIES (via Factory createSeries)
  // ============================================
  describe("registerSeries (via Factory)", function () {
    it("Should register series when created via factory", async function () {
      const { seriesAddress } = await createSeriesViaFactory(factory, protocol);
      const record = await registry.getSeriesRecord(seriesAddress);
      expect(record.protocol).to.equal(protocol.address);
      expect(record.active).to.be.true;
    });

    it("Should increment totalSeriesCreated for protocol", async function () {
      await createSeriesViaFactory(factory, protocol);
      const stats = await registry.getProtocolStats(protocol.address);
      expect(stats.seriesCreated).to.equal(1);
    });

    it("Should reject unauthorized registerSeries call", async function () {
      await expect(
        registry.connect(alice).registerSeries(protocol.address, alice.address, 0, 30)
      ).to.be.revertedWith("Not authorized");
    });
  });

  // ============================================
  // RECORD DISTRIBUTION
  // ============================================
  describe("recordDistribution", function () {
    let series;

    beforeEach(async function () {
      ({ series } = await createSeriesViaFactory(factory, protocol));
    });

    it("Should record distribution when protocol distributes revenue", async function () {
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("5") });
      const stats = await registry.getProtocolStats(protocol.address);
      expect(stats.revenueDelivered).to.equal(ethers.parseEther("5"));
      expect(stats.onTimePayments).to.equal(1);
    });

    it("Should accumulate multiple distributions", async function () {
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("5") });
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("3") });
      const stats = await registry.getProtocolStats(protocol.address);
      expect(stats.revenueDelivered).to.equal(ethers.parseEther("8"));
      expect(stats.onTimePayments).to.equal(2);
    });
  });

  // ============================================
  // UPDATE EXPECTED REVENUE
  // ============================================
  describe("updateExpectedRevenue", function () {
    let seriesAddress;

    beforeEach(async function () {
      ({ seriesAddress } = await createSeriesViaFactory(factory, protocol));
    });

    it("Should allow protocol to set expected revenue (one-time)", async function () {
      await expect(
        registry.connect(protocol).updateExpectedRevenue(seriesAddress, ethers.parseEther("100"))
      ).to.emit(registry, "ExpectedRevenueUpdated");
    });

    it("Should reject second update", async function () {
      await registry.connect(protocol).updateExpectedRevenue(seriesAddress, ethers.parseEther("100"));
      await expect(
        registry.connect(protocol).updateExpectedRevenue(seriesAddress, ethers.parseEther("200"))
      ).to.be.revertedWith("Already set");
    });

    it("Should reject non-protocol caller", async function () {
      await expect(
        registry.connect(alice).updateExpectedRevenue(seriesAddress, ethers.parseEther("100"))
      ).to.be.revertedWith("Only protocol owner");
    });

    it("Should reject zero amount", async function () {
      await expect(
        registry.connect(protocol).updateExpectedRevenue(seriesAddress, 0)
      ).to.be.revertedWith("Invalid amount");
    });
  });

  // ============================================
  // REPUTATION SCORE
  // ============================================
  describe("getReputationScore", function () {
    it("Should return 50 for new protocol (neutral)", async function () {
      const score = await registry.getReputationScore(alice.address);
      expect(score).to.equal(50);
    });

    it("Should return 0 for blacklisted protocol", async function () {
      await registry.blacklistProtocol(alice.address, "fraud");
      const score = await registry.getReputationScore(alice.address);
      expect(score).to.equal(0);
    });

    it("Should return 25 for protocol with series but no revenue promised", async function () {
      await createSeriesViaFactory(factory, protocol);
      // Protocol has series but expectedRevenue = 0 (default)
      const score = await registry.getReputationScore(protocol.address);
      expect(score).to.equal(25);
    });

    it("Should increase score when protocol delivers revenue", async function () {
      const { series, seriesAddress } = await createSeriesViaFactory(factory, protocol);
      await registry.connect(protocol).updateExpectedRevenue(seriesAddress, ethers.parseEther("100"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("50") });
      const score = await registry.getReputationScore(protocol.address);
      expect(score).to.be.gt(25);
    });
  });

  // ============================================
  // CHECK AND RECORD LATENESS
  // ============================================
  describe("checkAndRecordLateness", function () {
    let seriesAddress;

    beforeEach(async function () {
      ({ seriesAddress } = await createSeriesViaFactory(factory, protocol));
    });

    it("Should reject if not late yet", async function () {
      await expect(
        registry.checkAndRecordLateness(seriesAddress)
      ).to.be.revertedWith("Not late yet");
    });

    it("Should record lateness after cadence period", async function () {
      // Default cadence for >180 day series = 30 days
      await time.increase(31 * 24 * 60 * 60);
      await expect(
        registry.checkAndRecordLateness(seriesAddress)
      ).to.emit(registry, "LatePaymentRecorded");
    });

    it("Should prevent spam recording", async function () {
      await time.increase(31 * 24 * 60 * 60);
      await registry.checkAndRecordLateness(seriesAddress);
      await expect(
        registry.checkAndRecordLateness(seriesAddress)
      ).to.be.revertedWith("Already recorded for this period");
    });
  });

  // ============================================
  // BLACKLIST / WHITELIST
  // ============================================
  describe("Blacklist / Whitelist", function () {
    it("Should allow owner to blacklist protocol", async function () {
      await expect(registry.blacklistProtocol(protocol.address, "fraud"))
        .to.emit(registry, "ProtocolBlacklisted");
      const stats = await registry.getProtocolStats(protocol.address);
      expect(stats.isBlacklisted).to.be.true;
    });

    it("Should allow owner to whitelist protocol", async function () {
      await registry.blacklistProtocol(protocol.address, "fraud");
      await expect(registry.whitelistProtocol(protocol.address))
        .to.emit(registry, "ProtocolWhitelisted");
      const stats = await registry.getProtocolStats(protocol.address);
      expect(stats.isBlacklisted).to.be.false;
    });

    it("Should reject non-owner blacklist", async function () {
      await expect(registry.connect(alice).blacklistProtocol(protocol.address, "fraud"))
        .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });

    it("Should allow authorized reporter to reportDefault", async function () {
      await registry.authorizeReporter(alice.address);
      await expect(registry.connect(alice).reportDefault(protocol.address, "default"))
        .to.emit(registry, "ProtocolBlacklisted");
    });

    it("Should reject unauthorized reportDefault", async function () {
      await expect(registry.connect(alice).reportDefault(protocol.address, "default"))
        .to.be.revertedWith("Not authorized");
    });
  });

  // ============================================
  // VIEW FUNCTIONS
  // ============================================
  describe("View Functions", function () {
    it("Should return protocol series list", async function () {
      await createSeriesViaFactory(factory, protocol);
      await createSeriesViaFactory(factory, protocol, { name: "S2", symbol: "S2" });
      const series = await registry.getProtocolSeries(protocol.address);
      expect(series.length).to.equal(2);
    });

    it("Should return empty list for unknown protocol", async function () {
      const series = await registry.getProtocolSeries(alice.address);
      expect(series.length).to.equal(0);
    });
  });
});
