const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFullStack, createSeriesViaFactory, DEFAULT_PARAMS } = require("./helpers");

describe("RevenueSeries", function () {
  let owner, treasury, protocol, rest, registry, factory;
  let series, router, alice, bob;

  beforeEach(async function () {
    ({ owner, treasury, protocol, rest, registry, factory } = await deployFullStack());
    [alice, bob] = rest;
    ({ series, router } = await createSeriesViaFactory(factory, protocol));
  });

  // ============================================
  // IMMUTABLE STATE
  // ============================================
  describe("Immutable State", function () {
    it("Should have correct protocol address", async function () {
      expect(await series.protocol()).to.equal(protocol.address);
    });

    it("Should have correct router address", async function () {
      expect(await series.router()).to.equal(await router.getAddress());
    });

    it("Should have correct reputation registry", async function () {
      expect(await series.reputationRegistry()).to.equal(await registry.getAddress());
    });

    it("Should have correct revenue share BPS", async function () {
      expect(await series.revenueShareBPS()).to.equal(2000);
    });

    it("Should have correct total token supply", async function () {
      expect(await series.totalTokenSupply()).to.equal(DEFAULT_PARAMS.totalSupply);
    });

    it("Should have correct min distribution amount", async function () {
      expect(await series.minDistributionAmount()).to.equal(DEFAULT_PARAMS.minDistributionAmount);
    });

    it("Should have correct maturity date", async function () {
      const latest = await time.latest();
      const maturity = await series.maturityDate();
      const expected = latest + DEFAULT_PARAMS.durationDays * 24 * 60 * 60;
      expect(maturity).to.be.closeTo(expected, 5);
    });

    it("Should be active after creation", async function () {
      expect(await series.active()).to.be.true;
    });
  });

  // ============================================
  // ERC20 FUNCTIONALITY
  // ============================================
  describe("ERC20", function () {
    it("Should have correct name and symbol", async function () {
      expect(await series.name()).to.equal(DEFAULT_PARAMS.name);
      expect(await series.symbol()).to.equal(DEFAULT_PARAMS.symbol);
    });

    it("Should mint all tokens to protocol", async function () {
      expect(await series.balanceOf(protocol.address)).to.equal(DEFAULT_PARAMS.totalSupply);
    });

    it("Should allow transfers", async function () {
      const amount = ethers.parseEther("100000");
      await series.connect(protocol).transfer(alice.address, amount);
      expect(await series.balanceOf(alice.address)).to.equal(amount);
    });

    it("Should allow approve and transferFrom", async function () {
      const amount = ethers.parseEther("50000");
      await series.connect(protocol).approve(alice.address, amount);
      await series.connect(alice).transferFrom(protocol.address, bob.address, amount);
      expect(await series.balanceOf(bob.address)).to.equal(amount);
    });
  });

  // ============================================
  // DISTRIBUTE REVENUE
  // ============================================
  describe("distributeRevenue", function () {
    it("Should accept revenue from protocol", async function () {
      await expect(
        series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") })
      ).to.emit(series, "RevenueReceived");
    });

    it("Should accept revenue from router", async function () {
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
      await router.connect(protocol).routeRevenue();
      expect(await series.totalRevenueReceived()).to.be.gt(0);
    });

    it("Should reject revenue from unauthorized address", async function () {
      await expect(
        series.connect(alice).distributeRevenue({ value: ethers.parseEther("1") })
      ).to.be.revertedWith("Only protocol or router can distribute");
    });

    it("Should reject zero value", async function () {
      await expect(
        series.connect(protocol).distributeRevenue({ value: 0 })
      ).to.be.revertedWith("No revenue to distribute");
    });

    it("Should reject value below minDistributionAmount", async function () {
      await expect(
        series.connect(protocol).distributeRevenue({ value: ethers.parseEther("0.0009") })
      ).to.be.revertedWith("Distribution too small");
    });

    it("Should accept value = minDistributionAmount", async function () {
      await expect(
        series.connect(protocol).distributeRevenue({ value: ethers.parseEther("0.001") })
      ).to.not.be.reverted;
    });

    it("Should update totalRevenueReceived", async function () {
      const amount = ethers.parseEther("5");
      await series.connect(protocol).distributeRevenue({ value: amount });
      expect(await series.totalRevenueReceived()).to.equal(amount);
    });

    it("Should update revenuePerTokenStored", async function () {
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") });
      expect(await series.revenuePerTokenStored()).to.be.gt(0);
    });

    it("Should reject after maturity", async function () {
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await expect(
        series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") })
      ).to.be.revertedWith("Series matured");
    });

    it("Should reject after series is matured (inactive)", async function () {
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();
      await expect(
        series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") })
      ).to.be.revertedWith("Series not active");
    });

    it("Should reject direct ETH via receive()", async function () {
      await expect(
        protocol.sendTransaction({ to: await series.getAddress(), value: ethers.parseEther("1") })
      ).to.be.revertedWith("Use distributeRevenue() function");
    });
  });

  // ============================================
  // CLAIM REVENUE
  // ============================================
  describe("claimRevenue", function () {
    beforeEach(async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
    });

    it("Should allow holder to claim revenue", async function () {
      const balanceBefore = await ethers.provider.getBalance(alice.address);
      const tx = await series.connect(alice).claimRevenue();
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(alice.address);
      expect(balanceAfter + gasUsed).to.be.gt(balanceBefore);
    });

    it("Should emit RevenueClaimed event", async function () {
      await expect(series.connect(alice).claimRevenue())
        .to.emit(series, "RevenueClaimed");
    });

    it("Should calculate correct proportional share", async function () {
      const claimable = await series.calculateClaimable(alice.address);
      // alice has 100k out of 1M = 10%, revenue = 10 ETH, so claimable ~ 1 ETH
      expect(claimable).to.be.closeTo(ethers.parseEther("1"), ethers.parseEther("0.001"));
    });

    it("Should revert if no revenue to claim", async function () {
      await expect(series.connect(bob).claimRevenue())
        .to.be.revertedWith("No revenue to claim");
    });

    it("Should allow claimFor by anyone", async function () {
      const balanceBefore = await ethers.provider.getBalance(alice.address);
      await series.connect(bob).claimFor(alice.address);
      const balanceAfter = await ethers.provider.getBalance(alice.address);
      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should reject claimFor with zero address", async function () {
      await expect(series.connect(bob).claimFor(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid user");
    });

    it("Should zero out rewards after claim", async function () {
      await series.connect(alice).claimRevenue();
      expect(await series.calculateClaimable(alice.address)).to.equal(0);
    });

    it("Should handle multiple distributions and claims", async function () {
      await series.connect(alice).claimRevenue();
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("5") });
      const claimable = await series.calculateClaimable(alice.address);
      expect(claimable).to.be.closeTo(ethers.parseEther("0.5"), ethers.parseEther("0.001"));
    });
  });

  // ============================================
  // REWARD ACCOUNTING ON TRANSFER
  // ============================================
  describe("Reward Accounting on Transfer", function () {
    it("Should update rewards when tokens are transferred", async function () {
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      // protocol has all tokens, gets all revenue
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));
      // protocol's rewards should be snapshotted
      const protocolClaimable = await series.calculateClaimable(protocol.address);
      expect(protocolClaimable).to.be.closeTo(ethers.parseEther("10"), ethers.parseEther("0.001"));
    });

    it("Should give new holder revenue from future distributions only", async function () {
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));
      // alice should have 0 from first distribution
      expect(await series.calculateClaimable(alice.address)).to.equal(0);
      // new distribution
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      // alice has 50% of tokens, should get ~5 ETH
      const claimable = await series.calculateClaimable(alice.address);
      expect(claimable).to.be.closeTo(ethers.parseEther("5"), ethers.parseEther("0.001"));
    });
  });

  // ============================================
  // MATURITY
  // ============================================
  describe("Maturity", function () {
    it("Should reject matureSeries before maturity date", async function () {
      await expect(series.matureSeries()).to.be.revertedWith("Not matured yet");
    });

    it("Should allow matureSeries after maturity date", async function () {
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await expect(series.matureSeries()).to.emit(series, "SeriesMatured");
      expect(await series.active()).to.be.false;
    });

    it("Should reject double maturity", async function () {
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();
      await expect(series.matureSeries()).to.be.revertedWith("Already matured");
    });

    it("Should allow anyone to call matureSeries", async function () {
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await expect(series.connect(alice).matureSeries()).to.not.be.reverted;
    });

    it("Should still allow claims after maturity", async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();
      await expect(series.connect(alice).claimRevenue()).to.not.be.reverted;
    });
  });

  // ============================================
  // SERIES INFO
  // ============================================
  describe("getSeriesInfo", function () {
    it("Should return correct info", async function () {
      const info = await series.getSeriesInfo();
      expect(info.protocolAddress).to.equal(protocol.address);
      expect(info.revenueBPS).to.equal(2000);
      expect(info.isActive).to.be.true;
      expect(info.totalRevenue).to.equal(0);
    });

    it("Should show inactive after maturity", async function () {
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      const info = await series.getSeriesInfo();
      expect(info.isActive).to.be.false;
      expect(info.timeRemaining).to.equal(0);
    });
  });

  // ============================================
  // EFFECTIVE MIN DISTRIBUTION
  // ============================================
  describe("getEffectiveMinDistribution", function () {
    it("Should return a value > 0", async function () {
      const min = await series.getEffectiveMinDistribution();
      expect(min).to.be.gt(0);
    });
  });
});
