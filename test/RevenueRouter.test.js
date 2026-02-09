const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFullStack, createSeriesViaFactory, DEFAULT_PARAMS } = require("./helpers");

describe("RevenueRouter", function () {
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
      expect(await router.protocol()).to.equal(protocol.address);
    });

    it("Should have correct series address", async function () {
      expect(await router.revenueSeries()).to.equal(await series.getAddress());
    });

    it("Should have correct revenue share BPS", async function () {
      expect(await router.revenueShareBPS()).to.equal(2000);
    });

    it("Should have protocol as owner", async function () {
      expect(await router.owner()).to.equal(protocol.address);
    });
  });

  // ============================================
  // RECEIVE ETH
  // ============================================
  describe("Receive ETH", function () {
    it("Should accept ETH via receive()", async function () {
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
      const balance = await ethers.provider.getBalance(await router.getAddress());
      expect(balance).to.equal(ethers.parseEther("10"));
    });

    it("Should track totalRevenueReceived", async function () {
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
      expect(await router.totalRevenueReceived()).to.equal(ethers.parseEther("10"));
    });

    it("Should track pendingToRoute", async function () {
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
      expect(await router.pendingToRoute()).to.equal(ethers.parseEther("10"));
    });

    it("Should emit RevenueReceived event", async function () {
      await expect(
        alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") })
      ).to.emit(router, "RevenueReceived");
    });

    it("Should reject zero value", async function () {
      await expect(
        alice.sendTransaction({ to: await router.getAddress(), value: 0 })
      ).to.be.revertedWith("No revenue");
    });
  });

  // ============================================
  // ROUTE REVENUE
  // ============================================
  describe("routeRevenue", function () {
    beforeEach(async function () {
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
    });

    it("Should route revenue to series and protocol", async function () {
      await router.routeRevenue();
      // 20% of 10 ETH = 2 ETH to series
      expect(await series.totalRevenueReceived()).to.be.closeTo(
        ethers.parseEther("2"), ethers.parseEther("0.001")
      );
    });

    it("Should emit RevenueRouted event", async function () {
      await expect(router.routeRevenue()).to.emit(router, "RevenueRouted");
    });

    it("Should clear pendingToRoute after routing", async function () {
      await router.routeRevenue();
      expect(await router.pendingToRoute()).to.equal(0);
    });

    it("Should update totalRoutedToSeries", async function () {
      await router.routeRevenue();
      expect(await router.totalRoutedToSeries()).to.be.gt(0);
    });

    it("Should revert if no revenue to route after full withdrawal", async function () {
      await router.routeRevenue();
      // Withdraw remaining protocol share so balance is truly zero
      const remaining = await ethers.provider.getBalance(await router.getAddress());
      if (remaining > 0n) {
        await router.connect(protocol).withdrawAllToProtocol();
      }
      await expect(router.routeRevenue()).to.be.revertedWith("No revenue to route");
    });

    it("Should allow anyone to call routeRevenue", async function () {
      await expect(router.connect(alice).routeRevenue()).to.not.be.reverted;
    });

    it("Should handle multiple receive + route cycles", async function () {
      await router.routeRevenue();
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("5") });
      await router.routeRevenue();
      expect(await router.totalRoutedToSeries()).to.be.closeTo(
        ethers.parseEther("3"), ethers.parseEther("0.001")
      );
    });
  });

  // ============================================
  // RECEIVE AND ROUTE
  // ============================================
  describe("receiveAndRoute", function () {
    it("Should receive and immediately route", async function () {
      await router.connect(alice).receiveAndRoute({ value: ethers.parseEther("10") });
      expect(await series.totalRevenueReceived()).to.be.gt(0);
    });

    it("Should reject zero value", async function () {
      await expect(
        router.connect(alice).receiveAndRoute({ value: 0 })
      ).to.be.revertedWith("No revenue");
    });
  });

  // ============================================
  // WITHDRAW TO PROTOCOL
  // ============================================
  describe("withdrawToProtocol", function () {
    beforeEach(async function () {
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
      await router.routeRevenue();
    });

    it("Should allow protocol to withdraw available balance", async function () {
      const available = await ethers.provider.getBalance(await router.getAddress());
      if (available > 0n) {
        await expect(router.connect(protocol).withdrawToProtocol(available)).to.not.be.reverted;
      }
    });

    it("Should reject if pending revenue exists", async function () {
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("5") });
      await expect(
        router.connect(protocol).withdrawToProtocol(ethers.parseEther("1"))
      ).to.be.revertedWith("Must route pending revenue first");
    });

    it("Should reject unauthorized caller", async function () {
      await expect(
        router.connect(alice).withdrawToProtocol(ethers.parseEther("1"))
      ).to.be.revertedWith("Not authorized");
    });

    it("Should reject zero amount", async function () {
      await expect(
        router.connect(protocol).withdrawToProtocol(0)
      ).to.be.revertedWith("Invalid amount");
    });
  });

  // ============================================
  // WITHDRAW ALL TO PROTOCOL
  // ============================================
  describe("withdrawAllToProtocol", function () {
    it("Should withdraw all available balance", async function () {
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
      await router.routeRevenue();
      const available = await ethers.provider.getBalance(await router.getAddress());
      if (available > 0n) {
        await expect(router.connect(protocol).withdrawAllToProtocol()).to.not.be.reverted;
        expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(0);
      }
    });

    it("Should reject if pending revenue exists", async function () {
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("5") });
      await expect(
        router.connect(protocol).withdrawAllToProtocol()
      ).to.be.revertedWith("Must route pending revenue first");
    });
  });

  // ============================================
  // EMERGENCY WITHDRAW
  // ============================================
  describe("emergencyWithdraw", function () {
    it("Should reject non-owner", async function () {
      await expect(
        router.connect(alice).emergencyWithdraw(alice.address)
      ).to.be.revertedWithCustomError(router, "OwnableUnauthorizedAccount");
    });

    it("Should reject zero address", async function () {
      await expect(
        router.connect(protocol).emergencyWithdraw(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid address");
    });

    it("Should protect bondholder funds (pendingToRoute)", async function () {
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
      // All funds are pending, so nothing available
      await expect(
        router.connect(protocol).emergencyWithdraw(protocol.address)
      ).to.be.revertedWith("No available balance (funds protected for bondholders)");
    });
  });

  // ============================================
  // PAUSABLE
  // ============================================
  describe("Pausable", function () {
    it("Should allow owner to pause", async function () {
      await router.connect(protocol).pause();
      expect(await router.paused()).to.be.true;
    });

    it("Should reject routeRevenue when paused", async function () {
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
      await router.connect(protocol).pause();
      await expect(router.routeRevenue()).to.be.revertedWithCustomError(router, "EnforcedPause");
    });

    it("Should reject receiveAndRoute when paused", async function () {
      await router.connect(protocol).pause();
      await expect(
        router.connect(alice).receiveAndRoute({ value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(router, "EnforcedPause");
    });

    it("Should still accept ETH via receive() when paused", async function () {
      await router.connect(protocol).pause();
      await expect(
        alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("1") })
      ).to.not.be.reverted;
    });

    it("Should allow routing after unpause", async function () {
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
      await router.connect(protocol).pause();
      await router.connect(protocol).unpause();
      await expect(router.routeRevenue()).to.not.be.reverted;
    });
  });

  // ============================================
  // MATURED SERIES
  // ============================================
  describe("Matured Series", function () {
    it("Should handle routing when series is matured", async function () {
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
      // Should not revert, but emit RouteAttemptFailed
      await expect(router.routeRevenue()).to.emit(router, "RouteAttemptFailed");
    });

    it("Should clear pendingToRoute when series is matured", async function () {
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
      await router.routeRevenue();
      expect(await router.pendingToRoute()).to.equal(0);
    });

    it("Should allow protocol to withdraw after series matures", async function () {
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
      await router.routeRevenue(); // clears pending
      await expect(
        router.connect(protocol).withdrawAllToProtocol()
      ).to.not.be.reverted;
    });
  });

  // ============================================
  // ROUTER STATUS
  // ============================================
  describe("getRouterStatus", function () {
    it("Should return correct status", async function () {
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
      const status = await router.getRouterStatus();
      expect(status.currentBalance).to.equal(ethers.parseEther("10"));
      expect(status.totalReceived).to.equal(ethers.parseEther("10"));
      expect(status.shareBPS).to.equal(2000);
      expect(status.canRouteNow).to.be.true;
    });

    it("Should show canRouteNow = false after maturity", async function () {
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      const status = await router.getRouterStatus();
      expect(status.canRouteNow).to.be.false;
    });
  });
});
